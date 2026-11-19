import type { StorageDriver } from '@kobato/settings/types.ts'

import { DEFAULT_PUBLIC_CACHE_CONTROL } from '@kobato/server/infra/storage/key-policy.ts'
import { activeBackend, backendFor } from '@kobato/server/infra/storage/registry.ts'

// Owns the `fonts/<hash>/` key layout — nothing else reconstructs it.

export function fontPrefix(hash: string): string {
  return `fonts/${hash}/`
}

export function fontCssKey(hash: string): string {
  return `${fontPrefix(hash)}result.css`
}

export interface FontPackageFile {
  name: string
  body: Buffer
  contentType: string
}

export interface PutFontResult {
  driver: StorageDriver
}

/** Write a font package to the active backend under `fonts/<hash>/`. Idempotent (same hash = same bytes); files are public + immutable. */
export async function putFont(hash: string, files: FontPackageFile[]): Promise<PutFontResult> {
  const { backend, driver } = activeBackend()
  await Promise.all(
    files.map((file) =>
      backend.put({
        key: `${fontPrefix(hash)}${file.name}`,
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
  await backend.deletePrefix(fontPrefix(hash))
}
