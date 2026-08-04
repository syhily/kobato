import { resolveSiteAsset } from '@kobato/server/domains/assets/services/routes'
import { Buffer } from 'node:buffer'

// The OG renderer composes the dark-mode logo into the generated card.
// Resolving via `resolveSiteAsset` keeps a single code path for the
// custom-upload + bundled-default fallback (in-process cache included)
// so the render side never re-implements the S3 fetch flow.
export async function logoDark(): Promise<Buffer> {
  const resolved = await resolveSiteAsset('/logo-dark.svg')
  if (!resolved) {
    throw new Error('logo-dark.svg not registered in ASSET_ROUTES')
  }
  return resolved.content
}
