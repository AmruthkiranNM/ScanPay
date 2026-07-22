import { getPendingTxns, getAllTxns, updateTxnStatus, getUserProfile } from './storageService';
import { batchSync, hasToken } from './apiService';

// Sync lock — prevents concurrent sync calls that cause double-debit
let syncLock = false;

export async function runSync() {
  if (syncLock) {
    console.log('[Sync] Already running — skipping duplicate call');
    return { confirmed: 0, failed: 0, results: [] };
  }
  syncLock = true;

  try {
    if (!hasToken()) throw new Error('Not authenticated — cannot sync');

    // Get pending, failed, and unconfirmed_received txns
    const allTxns = await getAllTxns();
    const pending = allTxns.filter(t => 
      t.status === 'pending' || 
      t.status === 'failed' || 
      t.status === 'unconfirmed_received'
    );

    if (pending.length === 0) return { confirmed: 0, failed: 0, results: [] };

    // Get the current user's ID so we can fill in from_user_id for sent txns
    const profile = await getUserProfile();
    const myUserId = profile?.userId;

    // Build payloads for the server
    const payloads = pending.map(txn => {
      const fromUserId = txn.from_user_id || txn.fromUserId || (txn.type === 'sent' ? myUserId : undefined);

      return {
        id: txn.id,
        type: txn.type, // 'sent' or 'received' — server needs this
        from_user_id: fromUserId,
        to_user_id: txn.to_user_id || txn.toUserId || (txn.type === 'received' ? myUserId : undefined),
        from_pub: txn.from_pub || txn.payload?.from,
        amount: txn.amount,
        nonce: txn.nonce,
        signature: txn.signature,
        payloadString: txn.payloadString || (txn.payload ? JSON.stringify(txn.payload) : undefined),
        mode: txn.mode || 'offline_p2p',
        created_at: txn.created_at,
        expires_at: txn.expires_at
      };
    });

    console.log('[Sync] Sending', payloads.length, 'transactions. User:', myUserId);

    // Send to real server
    const { results, wallet } = await batchSync(payloads);

    console.log('[Sync] Results:', JSON.stringify(results));

    // Process results locally — only update transaction STATUSES
    // Do NOT manipulate local wallet balance here. The server wallet
    // is authoritative and will override via updateBalance() in App.jsx.
    let confirmed = 0, failed = 0;
    for (const r of results) {
      const localTxn = pending.find(t => t.id === r.id);
      if (!localTxn) continue;

      if (r.status === 'confirmed') {
        await updateTxnStatus(r.id, 'confirmed');
        confirmed++;
      } else if (r.status === 'pending') {
        // Still waiting for receiver to sync, keep it pending
      } else {
        console.warn('[Sync] Failed txn:', r.id?.slice(0, 8), 'reason:', r.fail_reason);
        await updateTxnStatus(r.id, 'failed', r.fail_reason);
        failed++;
      }
    }

    return { confirmed, failed, results, serverWallet: wallet };
  } finally {
    syncLock = false;
  }
}

// Auto-sync when online
export function startConnectivityWatcher(onSync) {
  let debounceTimer = null;

  const trySync = () => {
    // Debounce: wait 1s after the LAST 'online' event before syncing
    // This prevents double-fire from rapid online/offline toggles
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(async () => {
      if (!hasToken()) return;
      try {
        const result = await runSync();
        if (result.confirmed + result.failed > 0) onSync(result);
      } catch (e) {
        console.error('Auto-sync failed:', e.message);
      }
    }, 1500);
  };

  window.addEventListener('online', trySync);
  if (navigator.onLine) trySync(); // initial sync on app load

  return () => {
    window.removeEventListener('online', trySync);
    if (debounceTimer) clearTimeout(debounceTimer);
  };
}
