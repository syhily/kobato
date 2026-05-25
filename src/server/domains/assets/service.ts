import {
  BINARY_SLOTS,
  type BinarySlot,
  DEFAULT_BINARY,
  DEFAULT_BINARY_ETAG,
  DEFAULT_SVG,
  DEFAULT_SVG_ETAG,
  type SvgSlot,
} from '@/server/assets/defaults'
import { fetchBrandingObject, SLOT_CONTENT_TYPE } from '@/server/domains/assets/storage'
import { NODE_ENV } from '@/server/infra/env'
import { getBlogSettingsBundleSync } from '@/shared/config/getters'

interface SvgRoute {
  kind: 'svg'
  slot: SvgSlot
}

interface BinaryRoute {
  kind: 'binary'
  slot: BinarySlot
}

export type AssetRoute = SvgRoute | BinaryRoute

// Single source of truth for the public asset map. The router imports
// `ASSET_ROUTES` to register every path; `resolveSiteAsset` reads it to
// dispatch. Adding an asset means appending here only — no second list
// to keep in sync.
export const ASSET_ROUTES: Readonly<Record<string, AssetRoute>> = {
  '/favicon.svg': { kind: 'svg', slot: 'faviconSvg' },
  '/logo.svg': { kind: 'svg', slot: 'logoSvg' },
  '/logo-dark.svg': { kind: 'svg', slot: 'logoDarkSvg' },
  '/logo-large.svg': { kind: 'svg', slot: 'logoLargeSvg' },
  '/logo-large-dark.svg': { kind: 'svg', slot: 'logoLargeDarkSvg' },
  '/favicon.ico': { kind: 'binary', slot: 'faviconIco' },
  '/apple-touch-icon.png': { kind: 'binary', slot: 'appleTouchIcon' },
  '/images/icon-192.png': { kind: 'binary', slot: 'icon192' },
  '/images/icon-512.png': { kind: 'binary', slot: 'icon512' },
  '/images/open-graph.png': { kind: 'binary', slot: 'openGraph' },
  '/images/blog-poster.png': { kind: 'binary', slot: 'blogPoster' },
  '/images/blog-poster-dark.png': { kind: 'binary', slot: 'blogPosterDark' },
  '/images/default-avatar.png': { kind: 'binary', slot: 'defaultAvatar' },
}

// Defensive sanity check: every BinarySlot must have exactly one route.
// Mostly catches the case where the slot list grows but `ASSET_ROUTES`
// isn't updated, leaving an unreachable binary in the settings row.
if (NODE_ENV !== 'production') {
  const slots = new Set<string>(BINARY_SLOTS)
  for (const route of Object.values(ASSET_ROUTES)) {
    if (route.kind === 'binary') {
      slots.delete(route.slot)
    }
  }
  if (slots.size > 0) {
    throw new Error(`ASSET_ROUTES missing binary slots: ${Array.from(slots).join(', ')}`)
  }
}

export interface ResolvedAsset {
  content: Buffer
  contentType: string
  etag: string
}

export async function resolveSiteAsset(path: string): Promise<ResolvedAsset | null> {
  const route = ASSET_ROUTES[path]
  if (!route) {
    return null
  }
  if (route.kind === 'svg') {
    return resolveSvg(route.slot)
  }
  return resolveBinary(route.slot)
}

async function resolveSvg(slot: SvgSlot): Promise<ResolvedAsset> {
  const ref = getBlogSettingsBundleSync()?.assets?.branding?.[slot]
  if (ref) {
    const buffer = await fetchBrandingObject(slot, ref)
    if (buffer !== null) {
      return { content: buffer, contentType: ref.contentType, etag: ref.etag }
    }
    // S3 fetch failed (transient or the bucket has been pruned). Fall
    // through to the bundled default instead of 500'ing the route.
  }
  return {
    content: Buffer.from(DEFAULT_SVG[slot], 'utf8'),
    contentType: SLOT_CONTENT_TYPE[slot],
    etag: DEFAULT_SVG_ETAG[slot],
  }
}

async function resolveBinary(slot: BinarySlot): Promise<ResolvedAsset> {
  const ref = getBlogSettingsBundleSync()?.assets?.branding?.[slot]
  if (ref) {
    const buffer = await fetchBrandingObject(slot, ref)
    if (buffer !== null) {
      return { content: buffer, contentType: ref.contentType, etag: ref.etag }
    }
  }
  return {
    content: DEFAULT_BINARY[slot],
    contentType: SLOT_CONTENT_TYPE[slot],
    etag: DEFAULT_BINARY_ETAG[slot],
  }
}
