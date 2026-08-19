import type { SocialNetwork } from '@/shared/config/socials'
import type { SidebarSettings, SidebarWidgetType, SiteAssetBranding } from '@/shared/config/types'

import { isRecord } from '@/shared/utils/type-guards'

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

// Short version string from every configured branding ref's etag;
// templates append it as `?v=<version>` to bust the browser cache.
// Stable for a given configuration so duplicate renders agree.
export function brandingVersion(branding: SiteAssetBranding | undefined | null): string {
  if (!branding) {
    return ''
  }
  const etags: string[] = []
  for (const ref of Object.values(branding)) {
    if (isRecord(ref) && 'etag' in ref && typeof ref.etag === 'string') {
      etags.push(ref.etag)
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
