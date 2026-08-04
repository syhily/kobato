import type { StorageDriver } from '@kobato/shared/config/types'

import { DEFAULT_PUBLIC_CACHE_CONTROL } from '@kobato/server/infra/storage/backend'
import { activeBackend, backendFor } from '@kobato/server/infra/storage/registry'

// Storage entry point for the fonts domain. Mirrors `images/storage.ts`:
// writes go to the **active** backend (S3 when configured, local otherwise);
// reads/deletes dispatch on the font row's recorded `driver` so historical
// packages keep working after a local→S3 flip. This module owns the
// `fonts/<hash>/` key layout (`fontPrefix`/`fontCssKey`): upload persists
// `fontCssKey(hash)` as the row's `cssKey`, and render resolves the public
// URL from that persisted column via `resolveAssetUrl` — nothing else
// reconstructs the layout.

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

/**
 * Write every file of a sliced font package to the active backend under the
 * content-addressed `fonts/<hash>/` prefix. Idempotent: re-writing the same
 * hash overwrites in place (the hash is the source sha256, so the bytes are
 * identical). All files are marked public + immutable — packages are
 * content-addressed and never change once written.
 */
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

/**
 * Delete every object under `fonts/<hash>/` from the backend the package
 * lives on. Best-effort: a missing prefix is not an error. Uses
 * `deletePrefix` so the local backend also removes the empty directory
 * tree, not just individual files.
 */
export async function deleteFontPackage(hash: string, driver: StorageDriver): Promise<void> {
  const backend = backendFor(driver)
  await backend.deletePrefix(fontPrefix(hash))
}
