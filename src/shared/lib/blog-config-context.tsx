import { createContext, type Context, type ReactNode, use } from 'react'

import type { BundleKey } from '@/shared/config/sections'
import type {
  AssetsSettings,
  BlogSettingsBundle,
  ContentSettings,
  NavigationSettings,
  SeoSettings,
  SidebarSettings,
  SiteIdentitySettings,
  SocialsSettings,
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
const seoContext = makeCtx<SeoSettings>('seoContext')

// Only sections with a live hook below get a context — the provider wraps
// the tree in exactly these, nothing more.
const SECTION_CONTEXTS_ANY: Partial<Record<BundleKey, Context<any>>> = {
  siteIdentity: siteIdentityContext,
  assets: assetsContext,
  navigation: navigationContext,
  socials: socialsContext,
  content: contentContext,
  sidebar: sidebarContext,
  seo: seoContext,
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
    const Context = SECTION_CONTEXTS_ANY[key]
    if (Context === undefined) {
      continue
    }
    const slice = getSlice(value, key)
    tree = (
      <Context key={key} value={slice}>
        {tree}
      </Context>
    )
  }
  return tree
}

// Per-section accessors; strict variants throw when the section isn't
// seeded, `…Optional` degrade. The contexts are module-private, so a new
// `Optional` variant means adding an exported hook here, not consuming a
// context from outside.

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
