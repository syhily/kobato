// SEA/disk asset text reads.
//
// Single owner of the "embedded asset under SEA, real file on disk
// otherwise" read for JSON/SQL/text resources (warmup manifests, client
// manifests, migration SQL). Callers keep ownership of the asset key
// (the `@kobato/shared/sea/assets` contract) and the disk path; this module
// owns the `isSea()` dispatch and the missing-asset handling.

import { getEmbeddedAsset, isSea } from '@kobato/server/infra/sea'
import { existsSync, readFileSync } from 'node:fs'

/**
 * Read a text asset as UTF-8: the embedded SEA asset `key` when running
 * as a single executable, otherwise the file at `diskPath`. Returns null
 * when the asset or file is missing so callers can fall back.
 */
export function readAssetTextOrDisk(key: string, diskPath: string): string | null {
  if (isSea()) {
    return getEmbeddedAsset(key)?.toString('utf-8') ?? null
  }
  if (!existsSync(diskPath)) {
    return null
  }
  return readFileSync(diskPath, 'utf-8')
}

/**
 * Decode an embedded asset as UTF-8 text, throwing `missingMessage` when
 * the asset is absent. The caller supplies the message so each call site
 * keeps its specific diagnostic wording.
 */
export function requireEmbeddedAssetText(asset: Buffer | null, missingMessage: string): string {
  if (asset === null) {
    throw new Error(missingMessage)
  }
  return asset.toString('utf-8')
}
