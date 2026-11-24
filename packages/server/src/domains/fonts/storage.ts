import type { StorageDriver } from '@kobato/settings/types'

import { DEFAULT_PUBLIC_CACHE_CONTROL } from '@kobato/server/infra/storage/key-policy'
import { activeBackend, backendFor } from '@kobato/server/infra/storage/registry'

export function fontPrefix(hash: string, algorithmVersion: string): string {
  return `fonts/${hash}/${algorithmVersion}/`
}

export function fontCssKey(hash: string, algorithmVersion: string): string {
  return `${fontPrefix(hash, algorithmVersion)}result.css`
}

export interface FontPackageFile {
  name: string
  body: Buffer
  contentType: string
}

export interface PutFontResult {
  driver: StorageDriver
}

export async function putFont(
  hash: string,
  algorithmVersion: string,
  files: FontPackageFile[],
): Promise<PutFontResult> {
  const { backend, driver } = activeBackend()
  await Promise.all(
    files.map((file) =>
      backend.put({
        key: `${fontPrefix(hash, algorithmVersion)}${file.name}`,
        body: file.body,
        contentType: file.contentType,
        visibility: 'public',
        cacheControl: DEFAULT_PUBLIC_CACHE_CONTROL,
      }),
    ),
  )
  return { driver }
}

export async function deleteFontPackage(hash: string, driver: StorageDriver): Promise<void> {
  const backend = backendFor(driver)
  await backend.deletePrefix(`fonts/${hash}/`)
}

export async function deleteStaleFontPackage(hash: string, driver: StorageDriver, keepVersion: string): Promise<void> {
  const backend = backendFor(driver)
  const keep = fontPrefix(hash, keepVersion)
  const objects = await backend.list(`fonts/${hash}/`)
  const stale = objects.filter((obj) => !obj.key.startsWith(keep)).map((o) => o.key)
  await backend.deleteMany(stale)
}
