import { createContext, type Context, type ReactNode, use } from 'react'

import type { BundleKey } from '@/shared/config/sections'
import type {
  AnalyticsSettings,
  AssetsSettings,
  BackupSettings,
  BlogSettingsBundle,
  CacheSettings,
  CommentsSettings,
  ContentSettings,
  FontsSettings,
  LimitsSettings,
  MailSettings,
  NavigationSettings,
  NewsletterSettings,
  RateLimitSettings,
  SecuritySettings,
  SeoSettings,
  SidebarSettings,
  SiteIdentitySettings,
  SocialsSettings,
  WebmentionsSettings,
} from '@/shared/config/types'

import { BUNDLE_KEYS } from '@/shared/config/sections'

// Per-section React contexts. Adding a section = create the context and
// add it to `SECTION_CONTEXTS_ANY`. Per-section (not one bundle context):
// a save to one section never invalidates subscribers of another.

function makeCtx<T>(displayName: string): Context<T | undefined> {
  const ctx = createContext<T | undefined>(undefined)
  ctx.displayName = displayName
  return ctx
}

const siteIdentityContext = makeCtx<SiteIdentitySettings>('siteIdentityContext')
const assetsContext = makeCtx<AssetsSettings>('assetsContext')
const navigationContext = makeCtx<NavigationSettings>('navigationContext')
const socialsContext = makeCtx<SocialsSettings>('socialsContext')
const contentContext = makeCtx<ContentSettings>('contentContext')
const sidebarContext = makeCtx<SidebarSettings>('sidebarContext')
const commentsContext = makeCtx<CommentsSettings>('commentsContext')
const webmentionsContext = makeCtx<WebmentionsSettings>('webmentionsContext')
const seoContext = makeCtx<SeoSettings>('seoContext')
const mailContext = makeCtx<MailSettings>('mailContext')
const newsletterContext = makeCtx<NewsletterSettings>('newsletterContext')
const cacheContext = makeCtx<CacheSettings>('cacheContext')
const rateLimitContext = makeCtx<RateLimitSettings>('rateLimitContext')
const fontsContext = makeCtx<FontsSettings>('fontsContext')
const backupContext = makeCtx<BackupSettings>('backupContext')
const limitsContext = makeCtx<LimitsSettings>('limitsContext')
const analyticsContext = makeCtx<AnalyticsSettings>('analyticsContext')
const securityContext = makeCtx<SecuritySettings>('securityContext')

const SECTION_CONTEXTS_ANY: Record<BundleKey, Context<any>> = {
  siteIdentity: siteIdentityContext,
  assets: assetsContext,
  navigation: navigationContext,
  socials: socialsContext,
  content: contentContext,
  sidebar: sidebarContext,
  comments: commentsContext,
  webmentions: webmentionsContext,
  seo: seoContext,
  mail: mailContext,
  newsletter: newsletterContext,
  cache: cacheContext,
  rateLimit: rateLimitContext,
  fonts: fontsContext,
  backup: backupContext,
  limits: limitsContext,
  analytics: analyticsContext,
  security: securityContext,
}

interface BlogSettingsProviderProps {
  /** Live settings bundle from the root loader; `undefined` = pre-install deployment. */
  value: BlogSettingsBundle | undefined
  children: ReactNode
}

type Slice = NonNullable<BlogSettingsBundle[BundleKey]>
function getSlice(value: BlogSettingsBundle | undefined, key: BundleKey): Slice | undefined {
  return value === undefined ? undefined : ((value[key] ?? undefined) as Slice | undefined)
}

/** Root provider split into one context per section so a save to one section does not invalidate unrelated public chrome. */
export function BlogSettingsProvider({ value, children }: BlogSettingsProviderProps) {
  let tree: ReactNode = children
  for (const key of BUNDLE_KEYS) {
    const slice = getSlice(value, key)
    const Context = SECTION_CONTEXTS_ANY[key]
    tree = (
      <Context key={key} value={slice}>
        {tree}
      </Context>
    )
  }
  return tree
}

// Per-section accessors; strict variants throw when the section isn't
// seeded, `…Optional` degrade. New `Optional` variants should NOT be
// added — call `use(<sectionContext>)` directly if needed.

function useSection<T>(name: string, context: Context<T | undefined>): T {
  const slice = use(context)
  if (slice === undefined || slice === null) {
    throw new Error(`${name}: no <BlogSettingsProvider> in scope, or the settings section hasn't been seeded yet.`)
  }
  return slice
}

function useSectionOptional<T>(context: Context<T | undefined>): T | undefined {
  const slice = use(context)
  return slice ?? undefined
}

export function useSiteIdentity(): SiteIdentitySettings {
  return useSection('useSiteIdentity', siteIdentityContext)
}

export function useAssetsSettings(): AssetsSettings {
  return useSection('useAssetsSettings', assetsContext)
}
export function useAssetsSettingsOptional(): AssetsSettings | undefined {
  return useSectionOptional(assetsContext)
}

export function useNavigationSettings(): NavigationSettings {
  return useSection('useNavigationSettings', navigationContext)
}

export function useSocialsSettings(): SocialsSettings {
  return useSection('useSocialsSettings', socialsContext)
}

export function useContentSettings(): ContentSettings {
  return useSection('useContentSettings', contentContext)
}

export function useSidebarSettings(): SidebarSettings {
  return useSection('useSidebarSettings', sidebarContext)
}

export function useSeoSettingsOptional(): SeoSettings | undefined {
  return useSectionOptional(seoContext)
}
