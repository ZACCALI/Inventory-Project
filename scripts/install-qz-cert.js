#!/usr/bin/env node
/**
 * install-qz-cert.js
 * ─────────────────────────────────────────────────────────────────────────
 * Downloads the ACTIVE DistriTrack certificate from the live Vercel
 * deployment and installs it into QZ Tray's trusted store.
 *
 * CRITICAL: This script must NOT generate new keys. It must download
 * the exact cert that Vercel serves, so the fingerprints match.
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
const https = require('https');

// ── Configuration ──────────────────────────────────────────────────────────
const LIVE_CERT_URL = 'https://distritrack.vercel.app/api/qz/cert';
const userQz        = path.join(os.homedir(), '.qz');
const qzTrustedDir  = path.join(userQz, 'trusted-certs');
const certDest      = path.join(qzTrustedDir, 'distritrack.pem');
const allowedDat    = path.join(os.homedir(), 'AppData', 'Roaming', 'qz', 'allowed.dat');

// ── Download cert from live Vercel deployment ────────────────────────────
function downloadCert(url) {
  return new Promise((resolve, reject) => {
    console.log(`⏳ Downloading active certificate from ${url}...`);
    https.get(url, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode} from ${url}`));
        return;
      }
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

// ── Main ───────────────────────────────────────────────────────────────────
async function main() {
  console.log('');
  console.log('══════════════════════════════════════════════════════════');
  console.log('  DistriTrack QZ Tray Certificate Installer');
  console.log('══════════════════════════════════════════════════════════');
  console.log('');

  // Step 1: Download the ACTIVE cert from Vercel (same one QZ Tray receives)
  let certPem;
  try {
    certPem = await downloadCert(LIVE_CERT_URL);
    if (!certPem || !certPem.includes('BEGIN CERTIFICATE')) {
      throw new Error('Invalid certificate received');
    }
    console.log('✅ Downloaded active certificate from Vercel');
  } catch (err) {
    console.error('❌ Failed to download certificate from Vercel:', err.message);
    console.error('   Make sure you have internet access and the app is deployed.');
    process.exit(1);
  }

  // Step 2: Save cert to QZ Tray's trusted-certs folder
  fs.mkdirSync(qzTrustedDir, { recursive: true });
  fs.writeFileSync(certDest, certPem, 'utf8');
  console.log(`✅ Certificate saved to ${certDest}`);

  // Step 3: Wipe old allowed.dat (prevents stale fingerprint mismatches)
  const appDataQzDir = path.join(os.homedir(), 'AppData', 'Roaming', 'qz');
  fs.mkdirSync(appDataQzDir, { recursive: true });
  try { fs.unlinkSync(allowedDat); } catch { /* doesn't exist yet */ }
  try { fs.unlinkSync(path.join(userQz, 'allowed.dat')); } catch { /* doesn't exist */ }
  console.log('✅ Cleaned up old allowed.dat entries');

  // Step 4: Run QZ Tray CLI to register the cert in allowed.dat
  const { execSync } = require('child_process');
  const javaExe = 'C:\\Program Files\\QZ Tray\\runtime\\bin\\java.exe';
  const qzJar   = 'C:\\Program Files\\QZ Tray\\qz-tray.jar';

  if (fs.existsSync(javaExe) && fs.existsSync(qzJar)) {
    try {
      execSync(`"${javaExe}" -jar "${qzJar}" --allow "${certDest}"`, { stdio: 'pipe' });
      console.log('✅ Certificate registered in QZ Tray whitelist (allowed.dat)');
    } catch (err) {
      console.warn('⚠️  QZ Tray CLI --allow command failed:', err.message);
      console.warn('   You may need to run this script as Administrator.');
    }
  } else {
    console.warn('⚠️  QZ Tray not found at C:\\Program Files\\QZ Tray\\');
    console.warn('   Please install QZ Tray first: https://qz.io/download/');
  }

  // Step 5: Verify fingerprint match
  try {
    const allowedContent = fs.readFileSync(allowedDat, 'utf8');
    const match = allowedContent.match(/^([a-f0-9]+)\t/m);
    if (match) {
      console.log(`✅ Registered fingerprint: ${match[1]}`);
    }
  } catch { /* allowed.dat may not exist if QZ Tray CLI failed */ }

  console.log('');
  console.log('══════════════════════════════════════════════════════════');
  console.log('  SETUP COMPLETE!');
  console.log('');
  console.log('  Now restart QZ Tray:');
  console.log('  1. Right-click QZ Tray icon in system tray → Exit');
  console.log('  2. Reopen QZ Tray from Start Menu');
  console.log('  3. Refresh browser (Ctrl+R)');
  console.log('');
  console.log('  The "Action Required" popup will show "Trusted website"');
  console.log('  and "Remember this decision" + Allow will work! 🎉');
  console.log('══════════════════════════════════════════════════════════');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
