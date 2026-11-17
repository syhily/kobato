// Owns the "embedded asset under SEA, real file on disk otherwise" read
// for text resources (warmup/client manifests, migration SQL). Under SEA
// (`useVfs`) the asset is a plain file in the mounted VFS — same read.

import { seaAssetPath } from '@kobato/server/infra/sea.ts'
import { existsSync, readFileSync } from 'node:fs'

/** Read a text asset as UTF-8 — VFS-mounted `key` under SEA, `diskPath` otherwise; null when missing. */
export function readAssetTextOrDisk(key: string, diskPath: string): string | null {
  const assetPath = seaAssetPath(key)
  const path = assetPath ?? diskPath
  if (!existsSync(path)) {
    return null
  }
  return readFileSync(path, 'utf-8')
}
