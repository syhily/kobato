import type { SocialNetwork } from '@/shared/config/socials'
import type { BrandingObjectRef, SidebarSettings, SidebarWidgetType } from '@/shared/config/types'

export function getSidebarWidgetCount(
  settings: SidebarSettings,
  type: 'recentPosts' | 'recentComments' | 'randomTags',
): number {
  const widget = settings.sidebar.widgets.find((w) => w.type === type)
  if (!widget || !widget.enabled) {
    return 0
  }
  return widget.count ?? 0
}

export function isSidebarWidgetEnabled(settings: SidebarSettings, type: SidebarWidgetType): boolean {
  return settings.sidebar.widgets.some((w) => w.type === type && w.enabled)
}

export function extractXHandle(socials: Array<{ network: SocialNetwork; link: string }>): string | undefined {
  const x = socials.find((s) => s.network === 'x')
  if (!x?.link) {
    return undefined
  }
  try {
    const url = new URL(x.link)
    const handle = url.pathname.replace(/^\//, '')
    if (!handle) {
      return undefined
    }
    return handle.startsWith('@') ? handle : `@${handle}`
  } catch {
    return undefined
  }
}

// Per-slot cache-buster suffix from the branding ref's `updatedAt`, appended to
// the fixed branding asset paths (`/favicon.svg`, `/logo.svg`, …) so a re-upload
// changes the URL and browsers skip the stale copy. No ref (bundled default
// asset) → '' — the bare path serves. Matches `resolveAssetUrl`'s `?v=<ms>`
// convention for /storage/ URLs.
export function brandingVersionSuffix(ref: BrandingObjectRef | undefined | null): string {
  const ms = ref?.updatedAt ? Date.parse(ref.updatedAt) : Number.NaN
  return Number.isFinite(ms) ? `?v=${ms}` : ''
}
