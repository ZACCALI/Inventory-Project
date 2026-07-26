/**
 * POST /api/qz/regenerate
 * One-time endpoint to regenerate the QZ cert with cA=true
 * and save it to the database, replacing the old cA=false cert.
 */
import { NextResponse } from 'next/server';
import forge from 'node-forge';

export async function POST() {
  try {
    // Generate new cert with cA: true
    const keys = forge.pki.rsa.generateKeyPair(2048);
    const cert = forge.pki.createCertificate();

    cert.publicKey = keys.publicKey;
    cert.serialNumber = Date.now().toString(16).toUpperCase();

    cert.validity.notBefore = new Date();
    cert.validity.notAfter = new Date();
    cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 10);

    const attrs = [
      { name: 'commonName', value: 'DistriTrack POS' },
      { name: 'organizationName', value: 'DistriTrack' },
      { name: 'countryName', value: 'PH' },
    ];
    cert.setSubject(attrs);
    cert.setIssuer(attrs);

    // cA: true is CRITICAL for override.crt to work!
    cert.setExtensions([
      { name: 'basicConstraints', cA: true, critical: true },
      { name: 'keyUsage', digitalSignature: true, nonRepudiation: true, keyCertSign: true, critical: true },
      { name: 'extKeyUsage', codeSigning: true },
      { name: 'subjectAltName', altNames: [{ type: 2, value: 'localhost' }, { type: 7, ip: '127.0.0.1' }] },
    ]);

    cert.sign(keys.privateKey, forge.md.sha256.create());

    const publicKeyPem = forge.pki.certificateToPem(cert);
    const privateKeyPem = forge.pki.privateKeyToPem(keys.privateKey);

    // Save to database
    const { prisma } = await import('@/lib/prisma');
    await prisma.systemSettings.upsert({
      where: { id: '1' },
      create: { id: '1', qzCertPem: publicKeyPem, qzPrivateKeyPem: privateKeyPem },
      update: { qzCertPem: publicKeyPem, qzPrivateKeyPem: privateKeyPem },
    });

    // Parse the new cert to get its fingerprint
    const newCert = forge.pki.certificateFromPem(publicKeyPem);
    const der = forge.asn1.toDer(forge.pki.certificateToAsn1(newCert)).getBytes();
    const sha1 = forge.md.sha1.create();
    sha1.update(der);
    const fingerprint = sha1.digest().toHex();

    // Verify cA flag
    const bcExt = newCert.extensions.find((e: { name: string }) => e.name === 'basicConstraints');

    return NextResponse.json({
      success: true,
      message: 'Certificate regenerated with cA=true',
      fingerprint,
      cA: bcExt?.cA ?? false,
    });
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}
