import { SEA_CLIENT_ASSET_PREFIX } from '@kobato/distribution/sea-assets'
import { seaVfsRoot } from '@kobato/server/infra/sea/sea'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

export function clientAssetsRoot(): string {
  const diskRoot = fileURLToPath(new URL('../client', import.meta.url))
  const vfsRoot = seaVfsRoot()
  return vfsRoot === null ? diskRoot : join(vfsRoot, SEA_CLIENT_ASSET_PREFIX.replace(/\/$/, ''))
}
