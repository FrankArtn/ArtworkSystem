// app/api/orders/[id]/images/route.js
import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getSignedReadUrl } from '@/lib/gcs';

const jerr = (m, s = 400) => NextResponse.json({ error: m }, { status: s });

export async function GET(_req, { params }) {
  const { id } = await params;
  const jobId = Number(id);
  if (!Number.isFinite(jobId)) return jerr('invalid job id');

  const r = await query(
    `SELECT id, object_name, filename, content_type
       FROM job_images
      WHERE job_id = ?
      ORDER BY id DESC`,
    [jobId]
  );
  const rows = r.rows || [];

  // signed read URLs (1 hour)
  const out = await Promise.all(rows.map(async x => ({
    ...x,
    url: await getSignedReadUrl(x.object_name, 3600),
  })));

  return NextResponse.json(out);
}

export async function POST(req, { params }) {
  const { id } = await params;
  const jobId = Number(id);
  if (!Number.isFinite(jobId)) return jerr('invalid job id');

  const { objectName, filename, contentType } = await req.json().catch(() => ({}));
  if (!objectName) return jerr('objectName required');

  await query(
    `INSERT INTO job_images (job_id, object_name, filename, content_type)
     VALUES (?, ?, ?, ?)`,
    [jobId, objectName, filename || null, contentType || null]
  );

  const url = await getSignedReadUrl(objectName, 3600);
  return NextResponse.json({ ok: true, url });
}
