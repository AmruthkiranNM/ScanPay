import { getDB } from '../db.js';
import crypto from 'crypto';

const NONCE_WINDOW = 50;

/**
 * Verifies an Ed25519 signature in Node.js
 */
function verifyTxnSignature(payload, signatureB64, pubKeyB64) {
  try {
    console.log(`[DEBUG Crypto] payload:`, payload);
    console.log(`[DEBUG Crypto] signature:`, signatureB64);
    console.log(`[DEBUG Crypto] pubKeyB64:`, pubKeyB64);

    // Ed25519 SPKI prefix: 302a300506032b6570032100
    const spkiHeader = Buffer.from('302a300506032b6570032100', 'hex');
    const publicKey = crypto.createPublicKey({
      key: Buffer.concat([spkiHeader, Buffer.from(pubKeyB64, 'base64')]),
      format: 'der',
      type: 'spki'
    });
    
    const isValid = crypto.verify(
      null,
      Buffer.from(payload),
      publicKey,
      Buffer.from(signatureB64, 'base64')
    );
    console.log(`[DEBUG Crypto] isValid:`, isValid);
    return isValid;
  } catch (err) {
    console.error('Signature verification error:', err.message);
    return false;
  }
}

export function reconcileTransactions(userId, transactions) {
  const db = getDB();
  const results = [];

  for (const txn of transactions) {
    // 1. Already processed?
    const existing = db.prepare('SELECT status, to_user_id FROM transactions WHERE id = ?').get(txn.id);
    if (existing) { 
      // If the receiver is syncing a transaction that the sender already pushed, claim it!
      const actualToUserId = (!txn.to_user_id || txn.to_user_id === 'unknown' || txn.to_user_id === 'undefined') ? null : txn.to_user_id;
      if (existing.to_user_id === null && actualToUserId !== null) {
        try {
          db.transaction(() => {
            db.prepare('UPDATE transactions SET to_user_id = ? WHERE id = ?').run(actualToUserId, txn.id);
            db.prepare('UPDATE wallets SET confirmed_bal = confirmed_bal + ? WHERE user_id = ?').run(txn.amount, actualToUserId);
          })();
          console.log(`[Reconciler] Txn ${txn.id} claimed by receiver ${actualToUserId}`);
        } catch (e) {
          console.error(`[Reconciler] Failed to claim txn ${txn.id}:`, e.message);
        }
      }
      results.push({ id: txn.id, status: existing.status }); 
      continue; 
    }

    // If no recipient specified (Sender syncing an offline P2P txn), wait for Receiver to sync it
    if (!txn.to_user_id && !txn.to_pub) {
      results.push({ id: txn.id, status: 'pending' });
      continue;
    }

    // 2. Fetch sender details
    let sender;
    if (txn.from_user_id) {
      sender = db.prepare('SELECT id, pub_key FROM users WHERE id = ?').get(txn.from_user_id);
    } else if (txn.from_pub) {
      sender = db.prepare('SELECT id, pub_key FROM users WHERE pub_key = ?').get(txn.from_pub);
    }
    
    if (!sender) {
      results.push({ id: txn.id, status: 'failed', fail_reason: 'SENDER_NOT_FOUND' });
      continue;
    }

    const senderWallet = db.prepare('SELECT confirmed_bal, nonce_counter FROM wallets WHERE user_id = ?').get(sender.id);
    
    if (!senderWallet) {
      results.push({ id: txn.id, status: 'failed', fail_reason: 'SENDER_WALLET_NOT_FOUND' });
      continue;
    }

    // 3. Verify Signature (Security)
    if (!txn.payloadString) {
      results.push({ id: txn.id, status: 'failed', fail_reason: 'MISSING_PAYLOAD_STRING' });
      continue;
    }
    
    if (!verifyTxnSignature(txn.payloadString, txn.signature, sender.pub_key)) {
      results.push({ id: txn.id, status: 'failed', fail_reason: 'INVALID_SIGNATURE' });
      continue;
    }

    // 4. Check nonce window & replay
    const expectedMin = senderWallet.nonce_counter;
    if (txn.nonce <= expectedMin) {
      results.push({ id: txn.id, status: 'failed', fail_reason: 'NONCE_REPLAY_OR_OLD' });
      continue;
    }

    // 5. Check sufficient balance (from SENDER's wallet)
    if (senderWallet.confirmed_bal < txn.amount) {
      results.push({ id: txn.id, status: 'failed', fail_reason: 'INSUFFICIENT_BALANCE' });
      continue;
    }

    // 6. Confirm — atomic DB transaction
    try {
      const confirmTxn = db.transaction(() => {
        const actualToUserId = (!txn.to_user_id || txn.to_user_id === 'unknown' || txn.to_user_id === 'undefined') ? null : txn.to_user_id;
        db.prepare('UPDATE wallets SET confirmed_bal = confirmed_bal - ?, nonce_counter = ? WHERE user_id = ?').run(txn.amount, txn.nonce, sender.id);
        if (actualToUserId) {
          db.prepare('UPDATE wallets SET confirmed_bal = confirmed_bal + ? WHERE user_id = ?').run(txn.amount, actualToUserId);
        }
        
        try {
          db.prepare(`INSERT INTO transactions (id, from_user_id, to_user_id, amount, nonce, signature, mode, status, created_at, synced_at, expires_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(
            txn.id, 
            sender.id, 
            actualToUserId, 
            txn.amount, 
            txn.nonce, 
            txn.signature || null, 
            txn.mode || 'offline_p2p', 
            'confirmed', 
            txn.created_at || Math.floor(Date.now() / 1000), 
            Math.floor(Date.now() / 1000), 
            txn.expires_at || (txn.created_at ? txn.created_at + 86400 : Math.floor(Date.now() / 1000) + 86400)
          );
        } catch (insertErr) {
          console.error(`[Reconciler] INSERT FAILED for txn ${txn.id}`);
          console.error(`[Reconciler] VALUES: from_user_id=${sender.id}, to_user_id=${actualToUserId}`);
          throw insertErr; // Re-throw to trigger the rollback and failure state
        }
      });
      confirmTxn();
      results.push({ id: txn.id, status: 'confirmed' });
    } catch (err) {
      console.error(`Txn ${txn.id} failed: INTERNAL_ERROR: ${err.message}`);
      results.push({ id: txn.id, status: 'failed', fail_reason: 'INTERNAL_ERROR' });
    }
  }

  // Log all failed reasons for debugging
  results.filter(r => r.status === 'failed').forEach(r => {
    console.log(`[Reconciler] Txn ${r.id} FAILED: ${r.fail_reason}`);
  });

  const updatedWallet = db.prepare('SELECT confirmed_bal, locked_bal FROM wallets WHERE user_id = ?').get(userId);
  return { results, wallet: updatedWallet };
}
