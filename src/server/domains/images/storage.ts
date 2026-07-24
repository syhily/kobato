import type { AssetsSettings, StorageDriver } from '@/shared/config/types'

import { backendFor, activeBackend } from '@/server/infra/storage/registry'
import { requireBlogSettingsSection } from '@/shared/config/getters'

// Storage entry point used by the upload pipeline and the SSR enhancer.
// Writes go to the **active** backend (S3 when enabled + configured, local
// otherwise); reads/deletes dispatch on each asset's recorded `driver` so
// historical local assets keep working after S3 is switched on. Local is
// the always-available fallback, so uploads are never refused for a missing
// S3 config the way they were when this module gated on a single toggle.

/** Returns the live storage settings, or throws if the section is unseeded. */
export function getImageStorage(): AssetsSettings['storage'] {
  return requireBlogSettingsSection('assets').storage
}

export interface PutImageInput {
  /** Storage key relative to the bucket root / local root, e.g. `images/2026/05/...jpg`. */
  storagePath: string
  body: Buffer
  contentType: string
}

export interface PutImageResult {
  /** Backend the bytes were written to — persisted on the image row. */
  driver: StorageDriver
}

/** PUT to the active backend. Returns the driver so the caller can persist it on the row. */
export async function putImage(input: PutImageInput): Promise<PutImageResult> {
  const { backend, driver } = activeBackend()
  await backend.put({ key: input.storagePath, body: input.body, contentType: input.contentType, visibility: 'public' })
  return { driver }
}

/** DELETE from the backend the asset lives on. Best-effort: missing objects are not an error. */
export async function deleteImage(storagePath: string, driver: StorageDriver = 's3'): Promise<void> {
  await backendFor(driver).delete(storagePath)
}

/** GET from the backend the asset lives on. Throws `ActionFailure(404)` on a missing object. */
export async function getImage(storagePath: string, driver: StorageDriver = 's3'): Promise<Buffer> {
  return backendFor(driver).get(storagePath)
}

/** Optional URL transform template used by the front-end image helper. */
export function getPublicUrlTemplate(): string {
  return getImageStorage().urlTemplate.trim()
}
