import crypto from 'crypto';

function test() {
  const payloadString = '{"v":1,"qrType":"dynamic","id":"5c6293d5-170e-4f15-8256-3207f4551119","from":"O2zYUnIMSgFrGfaVOPfdleokcCtFpfAqJkcjrSJ7+Q8=","to":"unknown","amount":10000,"nonce":4,"ts":1781870945,"expires":1781871005}';
  const signatureB64 = 'AHL4WHQ06LT1k6R9Jy/QpnnOfe1GrnHir2AFPVysmnBKAs4F0CyaYMFMh/xhqxkjfHqwmAg2au3cSMYsnZ/2Cw==';
  
  // Use the public key that actually signed it!
  const pubKeyB64 = 'O2zYUnIMSgFrGfaVOPfdleokcCtFpfAqJkcjrSJ7+Q8=';

  const spkiHeader = Buffer.from('302a300506032b6570032100', 'hex');
  const publicKey = crypto.createPublicKey({
    key: Buffer.concat([spkiHeader, Buffer.from(pubKeyB64, 'base64')]),
    format: 'der',
    type: 'spki'
  });
  
  const isValid = crypto.verify(
    null,
    Buffer.from(payloadString),
    publicKey,
    Buffer.from(signatureB64, 'base64')
  );

  console.log('Is valid with correct string and key?', isValid);
}

test();
