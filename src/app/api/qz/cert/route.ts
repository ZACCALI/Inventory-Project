import { NextResponse } from 'next/server';
import { getQzKeys } from '@/lib/qzCert';

export async function GET() {
  const { publicKeyPem } = getQzKeys();
  return new NextResponse(publicKeyPem, {
    status: 200,
    headers: { 'Content-Type': 'text/plain' },
  });
}
