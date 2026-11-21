import type { SocialNetwork } from '@kobato/settings/socials'
import type { BrandingObjectRef, ContentSettings, SidebarSettings, SidebarWidgetType } from '@kobato/settings/types'

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

export function brandingVersionSuffix(ref: BrandingObjectRef | undefined | null): string {
  const ms = ref?.updatedAt ? Date.parse(ref.updatedAt) : Number.NaN
  return Number.isFinite(ms) ? `?v=${ms}` : ''
}

export const DEFAULT_FOOTNOTES_SECTION_TITLE = '尾声礼记'

export function resolveFootnotesSectionTitle(content: ContentSettings): string {
  const title = content.footnotes?.sectionTitle?.trim()
  return title !== undefined && title.length > 0 ? title : DEFAULT_FOOTNOTES_SECTION_TITLE
}
