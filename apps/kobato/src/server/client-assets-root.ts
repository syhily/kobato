import { SEA_CLIENT_ASSET_PREFIX } from '@kobato/base/distribution/sea-assets'
import { seaVfsRoot } from '@kobato/server/infra/sea/sea'
import { join } from 'node:path'

export function clientAssetsRoot(): string {
  const vfsRoot = seaVfsRoot()
  if (vfsRoot !== null) {
    return join(vfsRoot, SEA_CLIENT_ASSET_PREFIX.replace(/\/$/, ''))
  }
  return join(import.meta.dirname, '..', '..', 'build', 'workspace', 'client')
}
