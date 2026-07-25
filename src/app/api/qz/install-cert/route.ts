/**
 * GET /api/qz/install-cert
 * ─────────────────────────────────────────────────────────────────────────
 * Automatically installs the DistriTrack certificate into QZ Tray's
 * local trusted-certs folder (C:\Users\{user}\.qz\trusted-certs\).
 *
 * This endpoint is called from the browser, which means it runs on the
 * NEXT.JS SERVER process — which is on the SAME machine as QZ Tray when
 * running in local/dev mode.
 *
 * For Vercel deployments, this generates and downloads the cert instead.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { NextResponse } from 'next/server';
import { getQzKeys } from '@/lib/qzCert';
import fs from 'fs';
import path from 'path';
import os from 'os';

export async function POST() {
  const { publicKeyPem } = await getQzKeys();

  const qzTrustedDir = path.join(os.homedir(), '.qz', 'trusted-certs');
  const certDest     = path.join(qzTrustedDir, 'distritrack.pem');

  try {
    fs.mkdirSync(qzTrustedDir, { recursive: true });
    fs.writeFileSync(certDest, publicKeyPem, 'utf8');

    return NextResponse.json({
      success: true,
      message: 'Certificate installed. Please RESTART QZ Tray now.',
      path: certDest,
    });
  } catch (err) {
    console.error('[QZ] Failed to install cert to trusted-certs:', err);
    return NextResponse.json({
      success: false,
      error: 'Could not write to QZ trusted-certs folder. Try running npm run setup:qz manually.',
    }, { status: 500 });
  }
}

/** GET: Download the cert as a .pem file (fallback for Vercel/hosted deployments) */
export async function GET() {
  const { publicKeyPem } = await getQzKeys();
  return new NextResponse(publicKeyPem, {
    status: 200,
    headers: {
      'Content-Type': 'application/x-pem-file',
      'Content-Disposition': 'attachment; filename="distritrack.pem"',
    },
  });
}
