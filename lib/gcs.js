// lib/gcs.js
import { Storage } from '@google-cloud/storage';

const storage = new Storage({
  projectId: process.env.GCS_PROJECT_ID,
  credentials: {
    client_email: process.env.GCS_CLIENT_EMAIL,
    private_key: process.env.GCS_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  },
});

export const bucket = storage.bucket(process.env.GCS_BUCKET);

// 10 min signed upload (PUT)
export async function getSignedUploadUrl(objectName, contentType) {
  const [url] = await bucket.file(objectName).getSignedUrl({
    version: 'v4',
    action: 'write',
    expires: Date.now() + 10 * 60 * 1000,
    contentType,
  });
  return url;
}

// short read URL (private bucket)
export async function getSignedReadUrl(objectName, ttlSeconds = 3600) {
  const [url] = await bucket.file(objectName).getSignedUrl({
    version: 'v4',
    action: 'read',
    expires: Date.now() + ttlSeconds * 1000,
  });
  return url;
}

// If you decide to make objects public after upload:
export function publicUrl(objectName) {
  return `https://storage.googleapis.com/${process.env.GCS_BUCKET}/${encodeURIComponent(objectName)}`;
}

export async function deleteObject(objectName) {
  try {
    const file = bucket.file(objectName);

    // Optional: if your bucket ever enables Requester Pays, uncomment:
    // const opts = { userProject: process.env.GCS_PROJECT_ID };

    const [exists] = await file.exists(/* opts */);
    if (!exists) {
      // Nothing to delete in storage; treat as success
      return { ok: true, existed: false };
    }

    await file.delete(/* opts */);
    return { ok: true, existed: true };
  } catch (e) {
    console.error('GCS delete failed:', { objectName, err: e?.message });
    return { ok: false, error: e?.message || 'delete failed' };
  }
}