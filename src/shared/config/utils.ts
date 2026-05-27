import type { SocialNetwork } from '@/shared/config/socials'
import type { SiteAssetBranding, SidebarSettings } from '@/shared/config/types'

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

export function extractXHandle(socials: Array<{ network: SocialNetwork; link: string }>): string | undefined {
  const x = socials.find((s) => s.network === 'x')
  if (!x || !x.link) {
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

// Compose a short version string from every configured branding ref's
// etag. Public templates append it as `?v=<version>` to bust the
// browser cache when an admin replaces an asset. The result is stable
// for a given branding configuration (etag → bytes is 1:1) so
// duplicate render calls return the same query string.
export function brandingVersion(branding: SiteAssetBranding | undefined | null): string {
  if (!branding) {
    return ''
  }
  const etags: string[] = []
  for (const ref of Object.values(branding)) {
    if (ref && typeof ref === 'object' && typeof (ref as { etag?: unknown }).etag === 'string') {
      etags.push((ref as { etag: string }).etag)
    }
  }
  if (etags.length === 0) {
    return ''
  }
  let h = 5381
  for (const etag of etags) {
    for (let i = 0; i < etag.length; i++) {
      h = ((h << 5) + h + etag.charCodeAt(i)) | 0
    }
  }
  return (h >>> 0).toString(36)
}
