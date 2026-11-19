import {
  BINARY_SLOTS,
  type BinarySlot,
  DEFAULT_BINARY,
  DEFAULT_BINARY_ETAG,
  DEFAULT_SVG,
  DEFAULT_SVG_ETAG,
  type SvgSlot,
} from '@kobato/server/assets/defaults.ts'
import { fetchBrandingObject, SLOT_CONTENT_TYPE } from '@kobato/server/domains/assets/services/storage.ts'
import { NODE_ENV } from '@kobato/server/infra/config.ts'
import { getBlogSettingsBundleSync } from '@kobato/settings/getters.ts'

interface SvgRoute {
  kind: 'svg'
  slot: SvgSlot
}

interface BinaryRoute {
  kind: 'binary'
  slot: BinarySlot
}

export type AssetRoute = SvgRoute | BinaryRoute

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
  '/images/default-music-cover.png': { kind: 'binary', slot: 'defaultMusicCover' },
}

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

export async function resolveSiteAsset(path: string, options?: { original?: boolean }): Promise<ResolvedAsset | null> {
  const route = ASSET_ROUTES[path]
  if (!route) {
    return null
  }
  if (route.kind === 'svg') {
    return resolveSvg(route.slot, options?.original)
  }
  return resolveBinary(route.slot)
}

async function resolveSvg(slot: SvgSlot, original?: boolean): Promise<ResolvedAsset> {
  if (!original) {
    const ref = getBlogSettingsBundleSync()?.assets?.branding?.[slot]
    if (ref) {
      const buffer = await fetchBrandingObject(slot, ref)
      if (buffer !== null) {
        return { content: buffer, contentType: ref.contentType, etag: ref.etag }
      }
    }
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
