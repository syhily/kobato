import type { StorageDriver } from '@/shared/config/types'

import { DEFAULT_PUBLIC_CACHE_CONTROL } from '@/server/infra/storage/backend'
import { activeBackend, backendFor } from '@/server/infra/storage/registry'

// Storage entry point for the fonts domain. Writes go to the active backend;
// reads/deletes dispatch on the row's recorded `driver`. Owns the
// `fonts/<hash>/` key layout — nothing else reconstructs it.

/** Storage prefix for every file in a font package. Content-addressed by hash. */
export function fontPrefix(hash: string): string {
  return `fonts/${hash}/`
}

/** The single public entry point the SSR `<link>` points at. */
export function fontCssKey(hash: string): string {
  return `${fontPrefix(hash)}result.css`
}

export interface FontPackageFile {
  /** Path relative to the package root, e.g. `chunk-abc.woff2` or `result.css`. */
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

/** Delete every object under `fonts/<hash>/` on the recorded driver's backend. Best-effort — a missing prefix is not an error. */
export async function deleteFontPackage(hash: string, driver: StorageDriver): Promise<void> {
  const backend = backendFor(driver)
  await backend.deletePrefix(fontPrefix(hash))
}
