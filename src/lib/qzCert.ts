/**
 * QZ Tray Certificate Management
 * ─────────────────────────────────────────────────────────────────────
 * Generates a self-signed X.509 certificate (with required v3 extensions)
 * and persists the keypair in the database so that:
 *
 *   ✅ The SAME cert fingerprint is served on every Vercel cold-start
 *   ✅ QZ Tray can match the fingerprint in its trusted-certs folder
 *   ✅ "Remember this decision" + Allow works permanently
 *
 * Priority order for loading keys:
 *   1. In-memory cache (fastest, cleared on process restart)
 *   2. Database (SystemSettings.qzCertPem / qzPrivateKeyPem)
 *   3. .qz-keys.json on disk (local dev fallback)
 *   4. Generate fresh keys (first run)
 * ─────────────────────────────────────────────────────────────────────
 */

import forge from 'node-forge';

// ── In-memory cache (per process lifetime) ────────────────────────────────────
let keysCache: { publicKeyPem: string; privateKeyPem: string } | null = null;

// ── Generate a new valid keypair with all required X.509 v3 extensions ────────
function generateKeyPair(): { publicKeyPem: string; privateKeyPem: string } {
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

  // Required X.509 v3 extensions — cA MUST be true for QZ Tray override.crt to work
  cert.setExtensions([
    { name: 'basicConstraints', cA: true, critical: true },
    { name: 'keyUsage', digitalSignature: true, nonRepudiation: true, keyCertSign: true, critical: true },
    { name: 'extKeyUsage', codeSigning: true },
    { name: 'subjectAltName', altNames: [{ type: 2, value: 'localhost' }, { type: 7, ip: '127.0.0.1' }] },
  ]);

  cert.sign(keys.privateKey, forge.md.sha256.create());

  return {
    publicKeyPem:  forge.pki.certificateToPem(cert),
    privateKeyPem: forge.pki.privateKeyToPem(keys.privateKey),
  };
}

// ── Load keys: DB → disk → generate ──────────────────────────────────────────
export async function getQzKeys(): Promise<{ publicKeyPem: string; privateKeyPem: string }> {
  // 1. Memory cache
  if (keysCache) return keysCache;

  // 2. Try loading from database
  try {
    const { prisma } = await import('./prisma');
    const settings = await prisma.systemSettings.findFirst({ where: { id: '1' } });

    if (settings?.qzCertPem && settings?.qzPrivateKeyPem) {
      keysCache = { publicKeyPem: settings.qzCertPem, privateKeyPem: settings.qzPrivateKeyPem };
      return keysCache;
    }

    // Not in DB yet — generate and save to DB immediately
    const newKeys = generateKeyPair();
    await prisma.systemSettings.upsert({
      where:  { id: '1' },
      create: { id: '1', qzCertPem: newKeys.publicKeyPem, qzPrivateKeyPem: newKeys.privateKeyPem },
      update: {         qzCertPem: newKeys.publicKeyPem, qzPrivateKeyPem: newKeys.privateKeyPem },
    });
    keysCache = newKeys;
    return keysCache;
  } catch (dbErr) {
    console.warn('[QZ] DB unavailable, falling back to disk cache:', dbErr);
  }

  // 3. Disk fallback (local dev without DB)
  try {
    const fs   = (await import('fs')).default;
    const path = (await import('path')).default;
    const keyPath = path.join(process.cwd(), '.qz-keys.json');

    if (fs.existsSync(keyPath)) {
      const data = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
      if (data?.publicKeyPem && data?.privateKeyPem) {
        keysCache = data;
        return keysCache!;
      }
    }

    // 4. Generate and save to disk
    const newKeys = generateKeyPair();
    fs.writeFileSync(keyPath, JSON.stringify(newKeys, null, 2), 'utf8');
    keysCache = newKeys;
    return keysCache;
  } catch (fsErr) {
    console.warn('[QZ] Disk cache unavailable:', fsErr);
    // Last resort: generate ephemeral (won't persist, but won't crash)
    keysCache = generateKeyPair();
    return keysCache;
  }
}

// ── Synchronous version (uses cache only — must call getQzKeys() first) ───────
export function getQzKeysSync(): { publicKeyPem: string; privateKeyPem: string } {
  if (keysCache) return keysCache;

  // Fallback to disk for API routes that can't await
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs   = require('fs')   as typeof import('fs');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const path = require('path') as typeof import('path');
    const keyPath = path.join(process.cwd(), '.qz-keys.json');
    if (fs.existsSync(keyPath)) {
      const data = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
      if (data?.publicKeyPem && data?.privateKeyPem) {
        keysCache = data;
        return keysCache!;
      }
    }
  } catch { /* ignore */ }

  // Generate ephemeral as last resort
  const k = generateKeyPair();
  keysCache = k;
  return k;
}

/**
 * Sign a QZ Tray request string with SHA-512 RSA.
 * Must match qzService.ts → qz.security.setSignatureAlgorithm('SHA512')
 */
export async function signQzRequest(toSign: string): Promise<string> {
  const { privateKeyPem } = await getQzKeys();
  const privateKey = forge.pki.privateKeyFromPem(privateKeyPem);
  const md = forge.md.sha512.create();
  md.update(toSign, 'utf8');
  return forge.util.encode64(privateKey.sign(md));
}

/** Synchronous sign (uses cache — call getQzKeys() first or use disk fallback) */
export function signQzRequestSync(toSign: string): string {
  const { privateKeyPem } = getQzKeysSync();
  const privateKey = forge.pki.privateKeyFromPem(privateKeyPem);
  const md = forge.md.sha512.create();
  md.update(toSign, 'utf8');
  return forge.util.encode64(privateKey.sign(md));
}
