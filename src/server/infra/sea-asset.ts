// Owns the "embedded asset under SEA, real file on disk otherwise" read
// for text resources (warmup/client manifests, migration SQL).

import { existsSync, readFileSync } from 'node:fs'

import { getEmbeddedAsset, isSea } from '@/server/infra/sea'

/** Read a text asset as UTF-8 — embedded `key` under SEA, `diskPath` otherwise; null when missing. */
export function readAssetTextOrDisk(key: string, diskPath: string): string | null {
  if (isSea()) {
    return getEmbeddedAsset(key)?.toString('utf-8') ?? null
  }
  if (!existsSync(diskPath)) {
    return null
  }
  return readFileSync(diskPath, 'utf-8')
}

/** Decode an embedded asset as UTF-8, throwing `missingMessage` when absent. */
export function requireEmbeddedAssetText(asset: Buffer | null, missingMessage: string): string {
  if (asset === null) {
    throw new Error(missingMessage)
  }
  return asset.toString('utf-8')
}
