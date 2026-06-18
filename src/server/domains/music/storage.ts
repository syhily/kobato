import type { StorageDriver } from '@/shared/config/types'

import { resolveAssetUrl, safeResolveAssetUrl } from '@/server/infra/storage/public-url'
import { activeBackend, backendFor } from '@/server/infra/storage/registry'

// Music files use the same storage layer as the image library — the only
// thing that differs is the `Content-Type` and the `musics/` path prefix.
// Writes go to the active backend (S3 when configured, local otherwise);
// the per-track `driver` is persisted so reads/deletes and the SSR URL
// builder dispatch correctly after a local→S3 switch.

export interface PutMusicResult {
  driver: StorageDriver
}

/** Upload an MP3 audio object to the active backend. */
export async function putMusicAudio(key: string, body: Buffer): Promise<PutMusicResult> {
  const { backend, driver } = activeBackend()
  await backend.put({ key, body, contentType: 'audio/mpeg', visibility: 'public' })
  return { driver }
}

/** Upload a JPEG cover object to the active backend. */
export async function putMusicCover(key: string, body: Buffer): Promise<PutMusicResult> {
  const { backend, driver } = activeBackend()
  await backend.put({ key, body, contentType: 'image/jpeg', visibility: 'public' })
  return { driver }
}

/** Delete a music object (audio or cover) from the backend it lives on. */
export async function deleteMusicObject(key: string, driver: StorageDriver = 's3'): Promise<void> {
  await backendFor(driver).delete(key)
}

/**
 * Resolve the public URL for a music object. Dispatches on the per-track
 * `driver` (S3 → CDN, local → `/storage/*`). Throws `ActionFailure(503)`
 * for an S3 asset when the CDN base is unset.
 */
export function buildMusicPublicUrl(storagePath: string, driver: StorageDriver): string {
  return resolveAssetUrl(driver, storagePath)
}

/**
 * Lighter, error-tolerant variant for SSR list rendering — returns `null`
 * instead of throwing when an S3 asset's CDN base is unset.
 */
export function safeBuildMusicPublicUrl(storagePath: string, driver: StorageDriver): string | null {
  return safeResolveAssetUrl(driver, storagePath)
}
