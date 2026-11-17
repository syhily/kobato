import { resolveSiteAsset } from '@kobato/server/domains/assets/services/routes.ts'
import { Buffer } from 'node:buffer'

// Single code path for custom-upload + bundled-default logo resolution.
export async function logoDark(): Promise<Buffer> {
  const resolved = await resolveSiteAsset('/logo-dark.svg')
  if (!resolved) {
    throw new Error('logo-dark.svg not registered in ASSET_ROUTES')
  }
  return resolved.content
}
