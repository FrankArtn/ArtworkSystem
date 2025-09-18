import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { deleteObject } from '@/lib/gcs';

const jerr = (m, s = 400) => NextResponse.json({ error: m }, { status: s });

export async function DELETE(_req, { params }) {
  const { id, imageId } = await params;
  const jobId = Number(id);
  const imgId = Number(imageId);
  if (!Number.isFinite(jobId)) return jerr('invalid job id');
  if (!Number.isFinite(imgId)) return jerr('invalid image id');

  // 1) Look up the image record
  const r = await query(
    `SELECT id, object_name FROM job_images WHERE job_id = ? AND id = ? LIMIT 1`,
    [jobId, imgId]
  );
  const row = r.rows?.[0];
  if (!row) return jerr('image not found', 404);

  // 2) Delete from GCS (hard fail if it doesn’t work)
  const del = await deleteObject(row.object_name);
  if (!del.ok) {
    return jerr(`storage delete failed: ${del.error}`, 502);
  }

  // 3) Delete DB record only after storage success
  await query(`DELETE FROM job_images WHERE id = ?`, [imgId]);

  return NextResponse.json({ ok: true, storageExisted: del.existed });
}
