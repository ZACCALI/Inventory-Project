#!/usr/bin/env node
/**
 * install-qz-cert.js
 * ─────────────────────────────────────────────────────────────────────────
 * Generates a proper X.509 certificate (with required KeyUsage extensions)
 * and installs it into QZ Tray's trusted-cert store so that:
 *
 *   ✅  QZ Tray Details shows  "Validity: Valid"  (green)
 *   ✅  QZ Tray Details shows  "Trusted: Trusted website"
 *   ✅  Allow button is NEVER greyed out
 *   ✅  "Remember this decision" works permanently → zero popups forever
 *
 * Run ONCE per cashier PC:
 *   npm run setup:qz
 *
 * Then RESTART QZ Tray from the Windows system tray.
 * ─────────────────────────────────────────────────────────────────────────
 */

const fs   = require('fs');
const path = require('path');
const os   = require('os');

// ── Paths ──────────────────────────────────────────────────────────────────
const keyPath      = path.join(process.cwd(), '.qz-keys.json');
const qzTrustedDir = path.join(os.homedir(), '.qz', 'trusted-certs');
const certDest     = path.join(qzTrustedDir, 'distritrack.pem');

// ── Generate keypair with proper X.509 v3 extensions ─────────────────────
function generateAndSaveKeys() {
  let forge;
  try {
    forge = require('node-forge');
  } catch {
    console.error('ERROR: node-forge is not installed. Run: npm install node-forge');
    process.exit(1);
  }

  console.log('⏳ Generating 2048-bit RSA keypair with proper X.509 v3 extensions...');

  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();

  cert.publicKey   = keys.publicKey;
  cert.serialNumber = Date.now().toString(16).toUpperCase();

  cert.validity.notBefore = new Date();
  cert.validity.notAfter  = new Date();
  cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 10);

  const attrs = [
    { name: 'commonName',       value: 'DistriTrack POS' },
    { name: 'organizationName', value: 'DistriTrack'      },
    { name: 'countryName',      value: 'PH'               },
  ];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);

  // ── CRITICAL: Required X.509 v3 extensions for QZ Tray ─────────────────
  // Without these, QZ Tray shows "Invalid Certificate" (red)
  // and the Allow button is permanently disabled.
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
      codeSigning:     true,
      emailProtection: false,
    },
    {
      name: 'subjectAltName',
      altNames: [
        { type: 2, value: 'localhost' },
        { type: 7, ip:   '127.0.0.1' },
      ],
    },
  ]);

  cert.sign(keys.privateKey, forge.md.sha256.create());

  const keysData = {
    publicKeyPem:  forge.pki.certificateToPem(cert),
    privateKeyPem: forge.pki.privateKeyToPem(keys.privateKey),
  };

  fs.writeFileSync(keyPath, JSON.stringify(keysData, null, 2), 'utf8');
  console.log('✅ Keypair with X.509 v3 extensions saved to .qz-keys.json');
  return keysData;
}

// ── Main ───────────────────────────────────────────────────────────────────
// Always delete old keys and regenerate fresh — old keys had no extensions
if (fs.existsSync(keyPath)) {
  fs.unlinkSync(keyPath);
  console.log('🗑️  Deleted old .qz-keys.json (will regenerate with proper extensions)');
}

const keysData = generateAndSaveKeys();

// ── Install cert into QZ Tray trusted-certs ──────────────────────────────
fs.mkdirSync(qzTrustedDir, { recursive: true });
fs.writeFileSync(certDest, keysData.publicKeyPem, 'utf8');

// ── Create qz-tray.properties for domain whitelisting ────────────────────
const propsPath = path.join(os.homedir(), '.qz', 'qz-tray.properties');
const propsContent = [
  '# DistriTrack QZ Tray Configuration',
  '# Generated automatically - do not modify',
  '# This allows silent printing without security prompts',
  '',
  '# Whitelist localhost and Vercel deployment',
  'wss.whitelist=localhost,distritrack.vercel.app',
].join('\n');
fs.writeFileSync(propsPath, propsContent, 'utf8');

console.log('');
console.log('✅ Certificate installed successfully!');
console.log('   Location:', certDest);
console.log('');
console.log('══════════════════════════════════════════════════════════');
console.log('  ACTION REQUIRED — Restart QZ Tray to apply the cert:');
console.log('');
console.log('  1. Right-click QZ Tray icon in Windows system tray (bottom-right)');
console.log('  2. Click "Exit" or "Stop" to fully close QZ Tray');
console.log('  3. Open QZ Tray again from Start Menu / Desktop shortcut');
console.log('  4. Refresh the browser tab (press Ctrl+R or F5)');
console.log('');
console.log('  After restart, QZ Tray will show:');
console.log('    Validity: Valid  ✅');
console.log('    Trusted:  Trusted website  ✅');
console.log('');
console.log('  Check "Remember this decision" then Allow → zero popups forever! 🎉');
console.log('══════════════════════════════════════════════════════════');
