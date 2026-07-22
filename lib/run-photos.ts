// 러닝 사진 (R2', guide §110) — avatar-isomorphic 3-step per photo:
// ① POST /runs/{id}/photos/upload-url {slot, content_type} → {upload_url, path}
// ② PUT the bytes  ③ PATCH /runs/{id} {photos: [paths]} (order = display
// order; omitted paths are deleted server-side — replace/remove in one call).
// Probed live 2026-07-19: paths are {run_id}/-prefixed, foreign paths 422,
// signed URLs (1h) come back on GET detail, photo_thumb on list rows.
//
// ⚠️ EXIF hard rule (contract): storage does NOT strip metadata (negative-
// control probed 2026-07-19 — GPS EXIF survives byte-identical). Every
// image MUST pass reencodeForUpload() before PUT; never upload a picker
// URI directly.

import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import { apiFetch } from '@/lib/api';

export const MAX_RUN_PHOTOS = 3;
const MAX_DIM = 2048;

type UploadUrlResponse = {
  upload_url: string;
  path: string;
  max_bytes: number;
  allowed_types: string[];
};

/** Decode → (downscale to ≤2048px) → fresh JPEG(0.8). The re-encode is the
    EXIF strip: the rendered bitmap carries no metadata, so GPS coordinates
    from the camera never reach the server. Returns a local file URI. */
export async function reencodeForUpload(uri: string, width?: number, height?: number): Promise<string> {
  const ctx = ImageManipulator.manipulate(uri);
  if (width && height && Math.max(width, height) > MAX_DIM) {
    ctx.resize(width >= height ? { width: MAX_DIM } : { height: MAX_DIM });
  }
  const img = await ctx.renderAsync();
  const saved = await img.saveAsync({ format: SaveFormat.JPEG, compress: 0.8 });
  return saved.uri;
}

/** Full attach cycle for already-re-encoded local URIs. Sequential (slot
    order = display order); onProgress fires before each photo starts.
    Throws on the first failure — the caller retries the whole cycle
    (upload-urls re-issue cleanly, the final PATCH replaces). */
/** Edit-surface single upload (photo build, 2026-07-22): one re-encoded URI
    → one explicit slot → its path. NO PATCH here — the edit screen assembles
    the final ordered array (kept existing paths + new paths, display order)
    and PATCHes once; missing paths = server-side Storage delete (guide §112,
    교체·삭제 겸용). */
export async function uploadRunPhotoToSlot(runId: string, localUri: string, slot: number): Promise<string> {
  const { upload_url, path } = await apiFetch<UploadUrlResponse>(
    `/api/runs/${runId}/photos/upload-url`,
    { method: 'POST', body: { slot, content_type: 'image/jpeg' } },
  );
  const bytes = await (await fetch(localUri)).blob();
  const put = await fetch(upload_url, {
    method: 'PUT',
    headers: { 'Content-Type': 'image/jpeg' },
    body: bytes,
  });
  if (!put.ok) throw new Error(`사진 업로드 실패 (${put.status})`);
  return path;
}

export async function uploadRunPhotos(
  runId: string,
  localUris: string[],
  onProgress?: (done: number, total: number) => void,
): Promise<void> {
  const uris = localUris.slice(0, MAX_RUN_PHOTOS);
  const paths: string[] = [];
  for (let i = 0; i < uris.length; i++) {
    onProgress?.(i, uris.length);
    const { upload_url, path } = await apiFetch<UploadUrlResponse>(
      `/api/runs/${runId}/photos/upload-url`,
      { method: 'POST', body: { slot: i + 1, content_type: 'image/jpeg' } },
    );
    const bytes = await (await fetch(uris[i])).blob();
    const put = await fetch(upload_url, {
      method: 'PUT',
      headers: { 'Content-Type': 'image/jpeg' },
      body: bytes,
    });
    if (!put.ok) throw new Error(`사진 업로드 실패 (${put.status})`);
    paths.push(path);
  }
  onProgress?.(uris.length, uris.length);
  await apiFetch<void>(`/api/runs/${runId}`, { method: 'PATCH', body: { photos: paths } });
}
