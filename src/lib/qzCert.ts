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
      console.warn('Failed to parse .qz-keys.json, regenerating...', err);
      try { fs.unlinkSync(keyPath); } catch { /* ignore */ }
    }
  }

  // ── Generate 2048-bit RSA keypair ──────────────────────────────────────────
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey   = keys.publicKey;
  // Use a unique serial so QZ Tray doesn't cache old fingerprints
  cert.serialNumber = Date.now().toString(16).toUpperCase();

  cert.validity.notBefore = new Date();
  cert.validity.notAfter  = new Date();
  cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 10);

  // ── Subject / Issuer ──────────────────────────────────────────────────────
  const attrs = [
    { name: 'commonName',       value: 'DistriTrack POS' },
    { name: 'organizationName', value: 'DistriTrack'      },
    { name: 'countryName',      value: 'PH'               },
  ];
  cert.setSubject(attrs);
  cert.setIssuer(attrs); // self-signed

  // ── Required X.509 v3 extensions for QZ Tray ─────────────────────────────
  // QZ Tray Java validation REQUIRES these extensions or it shows
  // "Invalid Certificate" and disables the Allow button.
  cert.setExtensions([
    {
      name: 'basicConstraints',
      cA: false,
      critical: true,
    },
    {
      name: 'keyUsage',
      digitalSignature: true,
      nonRepudiation:   true,
      keyCertSign:      false,
      critical: true,
    },
    {
      name: 'extKeyUsage',
      codeSigning:      true,
      emailProtection:  false,
    },
    {
      name: 'subjectAltName',
      altNames: [
        { type: 2, value: 'localhost' },     // DNS
        { type: 7, ip:   '127.0.0.1' },     // IP
      ],
    },
  ]);

  // Sign the certificate — SHA-256 for the X.509 cert itself (standard)
  cert.sign(keys.privateKey, forge.md.sha256.create());

  const certPem       = forge.pki.certificateToPem(cert);
  const privateKeyPem = forge.pki.privateKeyToPem(keys.privateKey);

  keysCache = { publicKeyPem: certPem, privateKeyPem };

  // Persist to disk
  try {
    fs.writeFileSync(keyPath, JSON.stringify(keysCache, null, 2), 'utf8');
  } catch (err) {
    console.warn('Failed to save .qz-keys.json', err);
  }

  return keysCache;
}

/**
 * Sign a QZ Tray request string with SHA-512 RSA.
 * Must match qzService.ts → qz.security.setSignatureAlgorithm('SHA512')
 */
export function signQzRequest(toSign: string): string {
  const { privateKeyPem } = getQzKeys();
  const privateKey = forge.pki.privateKeyFromPem(privateKeyPem);
  const md = forge.md.sha512.create();
  md.update(toSign, 'utf8');
  return forge.util.encode64(privateKey.sign(md));
}
