import { SEA_CLIENT_ASSET_PREFIX } from '@kobato/base/distribution/sea-assets'
import { seaVfsRoot } from '@kobato/server/infra/sea/sea'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

export function clientAssetsRoot(): string {
  const vfsRoot = seaVfsRoot()
  if (vfsRoot !== null) {
    return join(vfsRoot, SEA_CLIENT_ASSET_PREFIX.replace(/\/$/, ''))
  }
  const require = createRequire(import.meta.url)
  return join(dirname(require.resolve('@kobato/web-admin/package.json')), 'build', 'client')
}
