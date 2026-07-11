// Avatar upload — the guide §프로필 3-step flow (probed live 2026-07-13):
// ① POST /me/avatar/upload-url → {upload_url, public_url, max_bytes,
//   allowed_types: jpeg/png/webp, 5MB}
// ② PUT the image bytes to upload_url (Content-Type required)
// ③ save public_url via PATCH /me/profile avatar_url — WITH ?v=timestamp
//   (CDN cache-bust; the storage path is fixed per user, re-upload overwrites)
// EXIF note: shipped per owner directive "server re-encodes" — the guide's
// avatar section doesn't document that (the run-photo contract puts EXIF
// stripping client-side); one-line 지연 confirm logged in TODO.

import { apiFetch } from '@/lib/api';

type UploadUrlResponse = {
  upload_url: string;
  public_url: string;
  max_bytes: number;
  allowed_types: string[];
};

/** Full cycle: local image URI → uploaded → cache-busted public URL
    (caller saves it via updateProfile). Throws on any step. */
export async function uploadAvatar(localUri: string, mimeType = 'image/jpeg'): Promise<string> {
  const { upload_url, public_url } = await apiFetch<UploadUrlResponse>(
    '/api/me/avatar/upload-url',
    { method: 'POST' },
  );
  const bytes = await (await fetch(localUri)).blob();
  const put = await fetch(upload_url, {
    method: 'PUT',
    headers: { 'Content-Type': mimeType },
    body: bytes,
  });
  if (!put.ok) throw new Error(`업로드 실패 (${put.status})`);
  return `${public_url}?v=${Date.now()}`;
}
