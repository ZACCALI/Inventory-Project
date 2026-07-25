import { NextRequest, NextResponse } from 'next/server';
import { signQzRequest } from '@/lib/qzCert';

export async function GET(request: NextRequest) {
  const requestToSign = request.nextUrl.searchParams.get('request') || '';
  const signature = await signQzRequest(requestToSign);
  return new NextResponse(signature, {
    status: 200,
    headers: { 'Content-Type': 'text/plain' },
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const requestToSign = body.request || body.toSign || '';
    const signature = await signQzRequest(requestToSign);
    return new NextResponse(signature, {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    });
  } catch {
    const text = await request.text();
    const signature = await signQzRequest(text);
    return new NextResponse(signature, {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    });
  }
}
