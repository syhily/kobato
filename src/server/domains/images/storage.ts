import type { AssetsSettings } from '@/shared/config/types'

import { ActionFailure } from '@/server/infra/http/errors'
import { deleteS3Object, getS3ObjectBuffer, putPublicS3Object } from '@/server/infra/storage/s3-client'
import { requireBlogSettingsSection } from '@/shared/config/getters'

// Storage entry point used by the upload pipeline and the SSR
// enhancer. Everything is conditioned on a single
// `images.storage.enabled` toggle:
//
//   - Toggle ON  → every PUT/DELETE goes to the configured S3-
//                  compatible bucket through `@/server/infra/storage/s3-client`.
//                  The runtime resolves public URLs by joining
//                  `<publicBaseUrl>/<storagePath>`.
//   - Toggle OFF → every PUT/DELETE is refused with `ActionFailure(503)`.
//                  The admin library still lists historical rows and
//                  the SSR enhancer can still resolve `<img src>` for
//                  rows whose `publicBaseUrl` was filled in earlier,
//                  so flipping the toggle off does not break public
//                  pages that already reference uploaded images.

const UPLOAD_DISABLED_MESSAGE = '图片上传未开启；请到 /admin/settings/assets 打开「启用 S3 上传」并填写存储桶配置。'

/** Returns the live storage settings, or throws `ActionFailure(503)` if the section is unseeded. */
export function getImageStorage(): AssetsSettings['storage'] {
  return requireBlogSettingsSection('assets').storage
}

/** Whether the admin has flipped the master upload toggle ON for this deployment. */
export function isUploadEnabled(): boolean {
  return getImageStorage().enabled
}

export interface PutImageInput {
  /** Storage key relative to the bucket root, e.g. `images/2026/05/...jpg`. */
  storagePath: string
  body: Buffer
  contentType: string
}

/** PUT to the configured S3 bucket. Refuses when the upload toggle is OFF. */
export async function putImage(input: PutImageInput): Promise<void> {
  ensureUploadReady()
  await putPublicS3Object({
    key: input.storagePath,
    body: input.body,
    contentType: input.contentType,
  })
}

/** DELETE from the configured S3 bucket. Best-effort: missing objects are not an error. */
export async function deleteImage(storagePath: string): Promise<void> {
  ensureUploadReady()
  await deleteS3Object(storagePath)
}

/** GET from the configured S3 bucket. Throws on missing object or network failure. */
export async function getImage(storagePath: string): Promise<Buffer> {
  return getS3ObjectBuffer(storagePath)
}

/** Optional URL transform template used by the front-end image helper. */
export function getPublicUrlTemplate(): string {
  return getImageStorage().urlTemplate.trim()
}

function ensureUploadReady(): void {
  const storage = getImageStorage()
  if (!storage.enabled) {
    throw new ActionFailure(503, UPLOAD_DISABLED_MESSAGE)
  }
  if (storage.secretAccessKey === '') {
    throw new ActionFailure(503, '请先在 /admin/settings/assets 配置 S3 Secret Access Key')
  }
}
