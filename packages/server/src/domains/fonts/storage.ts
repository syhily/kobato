import type { StorageDriver } from '@kobato/settings/types'

import { DEFAULT_PUBLIC_CACHE_CONTROL } from '@kobato/server/infra/storage/key-policy'
import { activeBackend, backendFor } from '@kobato/server/infra/storage/registry'

// Sliced packages are keyed by font hash AND slicing-algorithm version (ADR-0010 decision 5): an
// algorithm change derives a new version, so fresh slices never share keys with stale ones.
// Pre-versioning packages lived at `fonts/<hash>/result.css`; those keys stay served as-is until
// the font is re-uploaded (re-slicing needs the original bytes, which are not stored).
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

/// After a re-slice upgrade, remove the stale package of the same font. Old-format rows stored
/// files flat at `fonts/<hash>/…`; versioned rows nest them under `fonts/<hash>/<version>/`.
export async function deleteStaleFontPackage(hash: string, driver: StorageDriver, keepVersion: string): Promise<void> {
  const backend = backendFor(driver)
  const keep = fontPrefix(hash, keepVersion)
  const objects = await backend.list(`fonts/${hash}/`)
  const stale = objects.filter((obj) => !obj.key.startsWith(keep)).map((o) => o.key)
  await backend.deleteMany(stale)
}
