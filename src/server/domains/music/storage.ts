import { ActionFailure } from '@/server/infra/http/errors'
import { getPublicBaseUrl } from '@/server/infra/storage/public-url'
import { deleteS3Object, getS3StorageContext, putPublicS3Object } from '@/server/infra/storage/s3-client'

// Music files share the same S3 bucket and the same `assets.storage`
// toggle as the image library — see AGENTS.md "Content" section. The
// only thing that differs between an image upload and a music upload
// is the `Content-Type` we hand to S3 and the path prefix
// (`musics/` vs `images/`); the credentials, public base URL, and the
// "uploads disabled" gating are identical.
//
// This module exists so callers can say `putMusicAudio(...)` and
// `putMusicCover(...)` instead of leaking through the image-named
// helpers, which would be confusing in code review. Internally it
// delegates straight to `s3-client`.

/**
 * Upload an MP3 audio object. Throws `ActionFailure(503)` when the
 * upload toggle is OFF or credentials are missing — same gating as
 * the image library.
 */
export async function putMusicAudio(key: string, body: Buffer): Promise<void> {
  await putPublicS3Object({
    key,
    body,
    contentType: 'audio/mpeg',
  })
}

/** Upload a JPEG cover object. */
export async function putMusicCover(key: string, body: Buffer): Promise<void> {
  await putPublicS3Object({
    key,
    body,
    contentType: 'image/jpeg',
  })
}

/** Delete a music object (audio or cover) from S3. */
export async function deleteMusicObject(key: string): Promise<void> {
  await deleteS3Object(key)
}

/**
 * Resolve the public URL for a music object. Returns `null` when the
 * `assets.storage.enabled` toggle is OFF and the persisted
 * `publicBaseUrl` is empty (fresh install before any S3 config), so
 * the admin list can still render rows imported in a previous
 * deployment without crashing the request.
 */
export function buildMusicPublicUrl(storagePath: string): string {
  const publicBaseUrl = getPublicBaseUrl()
  if (publicBaseUrl === null) {
    throw new ActionFailure(503, '请先在 /admin/settings/assets 配置 S3 公共访问基地址')
  }
  const tail = storagePath.startsWith('/') ? storagePath.slice(1) : storagePath
  return `${publicBaseUrl}/${tail}`
}

/**
 * Lighter, error-tolerant variant for SSR list rendering — returns
 * `null` instead of throwing when the public base URL is unset, so
 * post-uninstall edge cases don't 503 the admin list.
 */
export function safeBuildMusicPublicUrl(storagePath: string): string | null {
  const publicBaseUrl = getPublicBaseUrl()
  if (publicBaseUrl === null) {
    return null
  }
  const tail = storagePath.startsWith('/') ? storagePath.slice(1) : storagePath
  return `${publicBaseUrl}/${tail}`
}

/**
 * Re-export of the storage-context resolver so write paths can verify
 * the upload toggle is ON before they spend cycles downloading the
 * audio bytes from the upstream provider.
 */
export async function ensureMusicStorageEnabled(): Promise<void> {
  await getS3StorageContext()
}
