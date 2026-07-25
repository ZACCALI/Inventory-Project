#!/usr/bin/env node
/**
 * install-qz-cert.js
 * ─────────────────────────────────────────────────────────────────
 * Installs the DistriTrack self-signed certificate into QZ Tray's
 * local trusted-certs folder so that:
 *   - QZ Tray shows "Trusted: Trusted website" in the Details dialog
 *   - The Allow button works with "Remember this decision" checked
 *   - The "Action Required" popup NEVER reappears after first Allow
 *
 * Run ONCE per cashier PC:
 *   npm run setup:qz
 * Then RESTART QZ Tray from the system tray.
 * ─────────────────────────────────────────────────────────────────
 */

const fs   = require('fs');
const path = require('path');
const os   = require('os');

// ── Paths ─────────────────────────────────────────────────────────
const keyPath      = path.join(process.cwd(), '.qz-keys.json');
const qzTrustedDir = path.join(os.homedir(), '.qz', 'trusted-certs');
const certDest     = path.join(qzTrustedDir, 'distritrack.pem');

// ── Helper: generate keypair using node-forge ──────────────────────
function generateAndSaveKeys() {
  let forge;
  try {
    forge = require('node-forge');
  } catch {
    console.error('ERROR: node-forge is not installed. Run: npm install node-forge');
    process.exit(1);
  }

  console.log('Generating 2048-bit RSA keypair (this may take a moment)...');

  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey   = keys.publicKey;
  cert.serialNumber = Date.now().toString(16);
  cert.validity.notBefore = new Date();
  cert.validity.notAfter  = new Date();
  cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 10);

  const attrs = [
    { name: 'commonName',      value: 'localhost' },
    { name: 'organizationName', value: 'DistriTrack' },
    { name: 'countryName',      value: 'PH' },
  ];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.sign(keys.privateKey, forge.md.sha256.create());

  const keysData = {
    publicKeyPem:  forge.pki.certificateToPem(cert),
    privateKeyPem: forge.pki.privateKeyToPem(keys.privateKey),
  };

  fs.writeFileSync(keyPath, JSON.stringify(keysData, null, 2), 'utf8');
  console.log('✅ Keypair generated and saved to .qz-keys.json');
  return keysData;
}

// ── Main ───────────────────────────────────────────────────────────
let keysData;

if (fs.existsSync(keyPath)) {
  try {
    keysData = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
    if (!keysData?.publicKeyPem || !keysData?.privateKeyPem) {
      console.warn('⚠️  .qz-keys.json is incomplete — regenerating...');
      fs.unlinkSync(keyPath);
      keysData = generateAndSaveKeys();
    } else {
      console.log('✅ Loaded existing keypair from .qz-keys.json');
    }
  } catch {
    console.warn('⚠️  .qz-keys.json is corrupt — regenerating...');
    fs.unlinkSync(keyPath);
    keysData = generateAndSaveKeys();
  }
} else {
  keysData = generateAndSaveKeys();
}

// ── Install cert into QZ Tray trusted-certs ────────────────────────
fs.mkdirSync(qzTrustedDir, { recursive: true });
fs.writeFileSync(certDest, keysData.publicKeyPem, 'utf8');

console.log('');
console.log('✅ Certificate installed successfully!');
console.log('   Location:', certDest);
console.log('');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('IMPORTANT: Restart QZ Tray now to apply the certificate:');
console.log('  1. Right-click the QZ Tray icon in the Windows system tray');
console.log('  2. Click "Exit" or "Stop"');
console.log('  3. Reopen QZ Tray from the Start menu or desktop icon');
console.log('  4. Refresh the browser tab (Ctrl+R)');
console.log('');
console.log('After restart, the "Action Required" popup will NEVER');
console.log('appear again — printing will be completely silent! 🎉');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
