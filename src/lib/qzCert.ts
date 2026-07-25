import fs from 'fs';
import path from 'path';
import forge from 'node-forge';

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

  // Generate 2048-bit RSA key pair for QZ Tray security handshake using node-forge
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = '01';
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date();
  cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 10);
  
  const attrs = [{
    name: 'commonName',
    value: 'localhost'
  }, {
    name: 'countryName',
    value: 'US'
  }, {
    shortName: 'ST',
    value: 'State'
  }, {
    name: 'localityName',
    value: 'City'
  }, {
    name: 'organizationName',
    value: 'Organization'
  }, {
    shortName: 'OU',
    value: 'Unit'
  }];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.sign(keys.privateKey, forge.md.sha256.create());

  const certPem = forge.pki.certificateToPem(cert);
  const privateKeyPem = forge.pki.privateKeyToPem(keys.privateKey);

  keysCache = {
    publicKeyPem: certPem,
    privateKeyPem: privateKeyPem,
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
  const privateKey = forge.pki.privateKeyFromPem(privateKeyPem);
  const md = forge.md.sha512.create();
  md.update(toSign, 'utf8');
  return forge.util.encode64(privateKey.sign(md));
}
