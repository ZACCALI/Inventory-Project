import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

let keysCache: { publicKeyPem: string; privateKeyPem: string } | null = null;

export function getQzKeys() {
  if (keysCache) return keysCache;

  const keyPath = path.join(process.cwd(), '.qz-keys.json');

  // Try to load from disk to prevent regenerating on every server restart
  if (fs.existsSync(keyPath)) {
    try {
      const data = fs.readFileSync(keyPath, 'utf8');
      keysCache = JSON.parse(data);
      if (keysCache?.publicKeyPem && keysCache?.privateKeyPem) {
        return keysCache;
      }
    } catch (err) {
      console.warn('Failed to parse .qz-keys.json, generating new keys...', err);
    }
  }

  // Generate 2048-bit RSA key pair for QZ Tray security handshake
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

  keysCache = {
    publicKeyPem: publicKey,
    privateKeyPem: privateKey,
  };

  // Persist to disk
  try {
    fs.writeFileSync(keyPath, JSON.stringify(keysCache, null, 2), 'utf8');
  } catch (err) {
    console.warn('Failed to save .qz-keys.json', err);
  }

  return keysCache;
}

export function signQzRequest(toSign: string): string {
  const { privateKeyPem } = getQzKeys();
  const sign = crypto.createSign('SHA512');
  sign.update(toSign);
  sign.end();
  return sign.sign(privateKeyPem, 'base64');
}
