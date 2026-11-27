import type { BundleKey } from '@kobato/settings/sections'
import type {
  AssetsSettings,
  BlogSettingsBundle,
  ContentSettings,
  FontsSettings,
  NavigationSettings,
  SeoSettings,
  SidebarSettings,
  SiteIdentitySettings,
  SocialsSettings,
} from '@kobato/settings/types'

import { BUNDLE_KEYS } from '@kobato/settings/sections'
import { createContext, type Context, type ReactNode, use } from 'react'

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
const fontsContext = makeCtx<FontsSettings>('fontsContext')

const SECTION_CONTEXTS_ANY: Partial<Record<BundleKey, Context<any>>> = {
  siteIdentity: siteIdentityContext,
  assets: assetsContext,
  navigation: navigationContext,
  socials: socialsContext,
  content: contentContext,
  sidebar: sidebarContext,
  seo: seoContext,
  fonts: fontsContext,
}

interface BlogSettingsProviderProps {
  value: BlogSettingsBundle | undefined
  children: ReactNode
}

type Slice = NonNullable<BlogSettingsBundle[BundleKey]>
function getSlice(value: BlogSettingsBundle | undefined, key: BundleKey): Slice | undefined {
  return value === undefined ? undefined : ((value[key] ?? undefined) as Slice | undefined)
}

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

export function useFontsSettings(): FontsSettings {
  return useSection('useFontsSettings', fontsContext)
}
export function useFontsSettingsOptional(): FontsSettings | undefined {
  return useSectionOptional(fontsContext)
}
