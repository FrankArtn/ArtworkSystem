// app/api/orders/[id]/images/sign-upload/route.js
import { NextResponse } from 'next/server';
import { getSignedUploadUrl } from '@/lib/gcs';
import crypto from 'crypto';

const jerr = (m, s = 400) => NextResponse.json({ error: m }, { status: s });

export async function POST(req, { params }) {
  const { id } = await params;             // Next 15 style
  const jobId = Number(id);
  if (!Number.isFinite(jobId)) return jerr('invalid job id');

  const { filename, contentType } = await req.json().catch(() => ({}));
  if (!filename || !contentType) return jerr('filename and contentType required');

  // e.g. jobs/123/uuid-filename.png
  const safeName = filename.replace(/[^a-zA-Z0-9._-]+/g, '_');
  const objectName = `jobs/${jobId}/${crypto.randomUUID()}-${safeName}`;

  const uploadUrl = await getSignedUploadUrl(objectName, contentType);
  return NextResponse.json({ uploadUrl, objectName });
}
