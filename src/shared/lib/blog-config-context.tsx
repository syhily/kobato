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
  RateLimitSettings,
  SearchSettings,
  SeoSettings,
  SidebarSettings,
  SiteIdentitySettings,
  SocialsSettings,
} from '@/shared/config/types'

import { BUNDLE_KEYS } from '@/shared/config/sections'

// Per-section React contexts. The keys are derived from the canonical
// `BUNDLE_KEYS` listing in `@/shared/config/settings`, so adding a new
// settings section is a one-line edit there — this file picks up the
// new context automatically and the matching strict-hook export below
// is the only call-site touch.
//
// Why one context per section (rather than one bundle context):
// `<BlogSettingsProvider>` re-renders once per save, but the
// per-section split means a save to `cache` never invalidates the
// component that subscribed to `footer`. The provider is a left-fold
// over the contexts so the JSX wedding cake stays size-O(1) in the
// number of sections.
type SectionContextMap = {
  [K in BundleKey]: Context<NonNullable<BlogSettingsBundle[K]> | undefined>
}

function makeContext<K extends BundleKey>(key: K): SectionContextMap[K] {
  const context = createContext<NonNullable<BlogSettingsBundle[K]> | undefined>(undefined)
  context.displayName = `${key}Context`
  return context as SectionContextMap[K]
}

const SECTION_CONTEXTS: SectionContextMap = {
  siteIdentity: makeContext('siteIdentity'),
  assets: makeContext('assets'),
  navigation: makeContext('navigation'),
  socials: makeContext('socials'),
  content: makeContext('content'),
  sidebar: makeContext('sidebar'),
  comments: makeContext('comments'),
  seo: makeContext('seo'),
  mail: makeContext('mail'),
  cache: makeContext('cache'),
  rateLimit: makeContext('rateLimit'),
  search: makeContext('search'),
  fonts: makeContext('fonts'),
  cors: makeContext('cors'),
  backup: makeContext('backup'),
  limits: makeContext('limits'),
  analytics: makeContext('analytics'),
}

interface BlogSettingsProviderProps {
  /**
   * Live settings bundle from the root loader. `undefined` indicates a
   * pre-install deployment (the install gate should have intercepted
   * the request, so this only matters for the install split-screen
   * itself).
   */
  value: BlogSettingsBundle | undefined
  children: ReactNode
}

// Iteration order mirrors `SETTINGS_SECTIONS` (via `BUNDLE_KEYS`). The
// resulting nested-provider tree is bottom-up but structurally
// equivalent to the previous hand-rolled wedding cake.
//
// Erase the discriminated `Context<S1> | Context<S2> | …` union into
// `Context<unknown>` for the loop body. TypeScript would otherwise
// fold the union's `value` parameter into `S1 & S2 & …` (contravariant
// position), which never matches any real section payload. The
// per-section type safety is still enforced at the hook layer below
// via `useSection<K>`/`useSectionOptional<K>`; the provider just
// shovels the right slice into the right context, which is a runtime
// guarantee from the matching `key`.
const SECTION_ENTRIES = BUNDLE_KEYS.map((key) => [key, SECTION_CONTEXTS[key]] as const) as Array<
  [BundleKey, Context<unknown>]
>
type Slice = NonNullable<BlogSettingsBundle[BundleKey]>
function getSlice(value: BlogSettingsBundle | undefined, key: BundleKey): Slice | undefined {
  return value === undefined ? undefined : ((value[key] ?? undefined) as Slice | undefined)
}

/**
 * Root settings provider split into one context per section. Public
 * consumers keep calling `useFooterSettings()` / `useSidebarSettings()`
 * etc., but each hook subscribes only to the bucket it renders so a save
 * to one settings section does not invalidate unrelated public chrome.
 */
export function BlogSettingsProvider({ value, children }: BlogSettingsProviderProps) {
  let tree: ReactNode = children
  for (const [key, Context] of SECTION_ENTRIES) {
    const slice = getSlice(value, key)
    tree = (
      <Context.Provider key={key} value={slice}>
        {tree}
      </Context.Provider>
    )
  }
  return tree
}

// ---------------------------------------------------------------------------
// Per-section accessors. Each section ships a strict variant that
// throws when the section hasn't been seeded — fine for sections the
// install flow always populates and the consumer renders after the
// install gate has cleared. A handful of accessors that run BEFORE
// the install completes (`siteIdentity`, `assets`) or that have to
// gracefully degrade for legacy markdown trees (`seo`) also expose
// an `…Optional` variant that returns `undefined`. New unused
// `Optional` variants should NOT be added — call `use(<sectionContext>)`
// directly if you genuinely need the lenient read.
// ---------------------------------------------------------------------------

function useSection<K extends BundleKey>(name: string, key: K): NonNullable<BlogSettingsBundle[K]> {
  const slice = use(SECTION_CONTEXTS[key])
  if (slice === undefined || slice === null) {
    throw new Error(
      `${name}: no <BlogSettingsProvider> in scope, or the "${key}" settings section hasn't been seeded yet.`,
    )
  }
  return slice as NonNullable<BlogSettingsBundle[K]>
}

function useSectionOptional<K extends BundleKey>(key: K): NonNullable<BlogSettingsBundle[K]> | undefined {
  const slice = use(SECTION_CONTEXTS[key])
  return slice ?? undefined
}

export function useSiteIdentity(): SiteIdentitySettings {
  return useSection('useSiteIdentity', 'siteIdentity')
}
export function useSiteIdentityOptional(): SiteIdentitySettings | undefined {
  return useSectionOptional('siteIdentity')
}

export function useAssetsSettings(): AssetsSettings {
  return useSection('useAssetsSettings', 'assets')
}
export function useAssetsSettingsOptional(): AssetsSettings | undefined {
  return useSectionOptional('assets')
}

export function useNavigationSettings(): NavigationSettings {
  return useSection('useNavigationSettings', 'navigation')
}

export function useSocialsSettings(): SocialsSettings {
  return useSection('useSocialsSettings', 'socials')
}

export function useContentSettings(): ContentSettings {
  return useSection('useContentSettings', 'content')
}

export function useSidebarSettings(): SidebarSettings {
  return useSection('useSidebarSettings', 'sidebar')
}

export function useCommentsSettings(): CommentsSettings {
  return useSection('useCommentsSettings', 'comments')
}

export function useSeoSettings(): SeoSettings {
  return useSection('useSeoSettings', 'seo')
}
export function useSeoSettingsOptional(): SeoSettings | undefined {
  return useSectionOptional('seo')
}

export function useMailSettings(): MailSettings {
  return useSection('useMailSettings', 'mail')
}

export function useCacheSettings(): CacheSettings {
  return useSection('useCacheSettings', 'cache')
}

// `rateLimit` is admin-only today (no public chrome reads it), but
// the matching context + hooks land here for symmetry with the other
// sections — adding a future "rate limit dashboard widget" is a one
// line `useRateLimitSettings()` call away. The strict variant fires
// when the install seeded the row (default behaviour today); the
// `…Optional` variant tolerates a pre-install / partially-truncated
// snapshot and is reserved for the rare diagnostic surface.
export function useRateLimitSettings(): RateLimitSettings {
  return useSection('useRateLimitSettings', 'rateLimit')
}
export function useRateLimitSettingsOptional(): RateLimitSettings | undefined {
  return useSectionOptional('rateLimit')
}

export function useSearchSettings(): SearchSettings {
  return useSection('useSearchSettings', 'search')
}
export function useSearchSettingsOptional(): SearchSettings | undefined {
  return useSectionOptional('search')
}

export function useFontsSettings(): FontsSettings {
  return useSection('useFontsSettings', 'fonts')
}
export function useFontsSettingsOptional(): FontsSettings | undefined {
  return useSectionOptional('fonts')
}

export function useBackupSettings(): BackupSettings {
  return useSection('useBackupSettings', 'backup')
}
export function useBackupSettingsOptional(): BackupSettings | undefined {
  return useSectionOptional('backup')
}

export function useLimitsSettings(): LimitsSettings {
  return useSection('useLimitsSettings', 'limits')
}
export function useLimitsSettingsOptional(): LimitsSettings | undefined {
  return useSectionOptional('limits')
}

export function useAnalyticsSettings(): AnalyticsSettings {
  return useSection('useAnalyticsSettings', 'analytics')
}
export function useAnalyticsSettingsOptional(): AnalyticsSettings | undefined {
  return useSectionOptional('analytics')
}
