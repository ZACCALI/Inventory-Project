import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireAuth } from '@/lib/apiAuth';
import { logger } from '@/lib/logger';

// Initialize Supabase client
// Use service role key to bypass RLS for uploads, or anon key if RLS allows authenticated uploads.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder';

// Create client lazily or just let it initialize with placeholders (it will be caught in POST if actual keys are missing)
const supabase = createClient(supabaseUrl, supabaseKey);

export async function POST(request: NextRequest) {
  try {
    const { user, error } = await requireAuth();
    if (error) return error;

    const data = await request.formData();
    const file: File | null = data.get('file') as unknown as File;

    if (!file) {
      logger.warn({ userId: user.id }, 'Upload attempt without file');
      return NextResponse.json({ success: false, error: 'No file uploaded' }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const mimeType = file.type || 'image/png';
    const base64DataUrl = `data:${mimeType};base64,${buffer.toString('base64')}`;

    if (supabaseUrl === 'https://placeholder.supabase.co' || supabaseKey === 'placeholder') {
      logger.info({ userId: user.id }, 'Supabase storage credentials placeholder — using Base64 Data URL fallback');
      return NextResponse.json({ success: true, url: base64DataUrl });
    }

    const filename = `${user.id}-${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '')}`;
    
    // Upload to Supabase Storage bucket 'uploads'
// eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { data: uploadData, error: uploadError } = await supabase
      .storage
      .from('uploads')
      .upload(filename, buffer, {
        contentType: file.type,
        upsert: false
      });

    if (uploadError) {
      logger.error({ err: uploadError }, 'Supabase upload failed');
      const dataUrl = `data:${file.type};base64,${buffer.toString('base64')}`;
      return NextResponse.json({ success: true, url: dataUrl });
    }

    // Get the public URL for the uploaded file
    const { data: publicUrlData } = supabase
      .storage
      .from('uploads')
      .getPublicUrl(filename);

    const fileUrl = publicUrlData.publicUrl;

    logger.info({ userId: user.id, filename, size: bytes.byteLength }, 'File uploaded successfully to Supabase');
    
    return NextResponse.json({ success: true, url: fileUrl });
  } catch (error) {
    logger.error({ err: error }, 'Error uploading file');
    return NextResponse.json({ success: false, error: 'Failed to upload file' }, { status: 500 });
  }
}
