import type { MetaDescriptor } from 'react-router'

import type { BlogSettingsBundle, SiteAssetBranding } from '@/shared/config/types'
import type { AppLocale } from '@/shared/i18n/locales'
import type { UiMessageId } from '@/shared/i18n/messages/ui/en-US'

// Isomorphic by construction: route `meta()` exports pull this module into the
// browser bundle, so it may only import `@/shared/*` — never
// `@/shared/i18n/catalog`. Localized copy arrives as the root loader's `i18n`
// payload through `matches`.
import { getBlogSettingsBundleSync } from '@/shared/config/getters'
import { brandingVersionSuffix, extractXHandle } from '@/shared/config/utils'
import { fallbackMessages } from '@/shared/i18n/fallback-messages'
import { isSupportedLocale, toOpenGraphLocale } from '@/shared/i18n/locales'
import { ogImagePathForSlug } from '@/shared/seo/og-image'
import { isRecord } from '@/shared/utils/type-guards'
import { unsafeCast } from '@/shared/utils/unsafe-cast'
import { joinUrl } from '@/shared/utils/urls'

/**
 * The i18n payload the root loader forwards from `content.bootstrap`. `meta()`
 * runs again on client navigation, so this must come from `matches`, never the
 * server settings snapshot.
 */
export interface SeoI18n {
  locale: AppLocale
  /** Document-scope UI catalog; only title-key lookups read it. */
  messages: Readonly<Record<string, string>>
}

interface ArticleSeo {
  date: Date | string
  updated?: Date | string
  category?: string
  tags?: string[]
}

type SeoVariant = { kind: 'page'; article: ArticleSeo } | { kind: 'post'; article: ArticleSeo } | { kind: 'website' }

export interface FeedLinkOptions {
  rss?: string
  atom?: string
  title?: string
}

export interface RouteSeoOptions {
  /** Raw content title (post/page/category/tag/navigation copy). Never a message id. */
  title?: string
  /** Static document title: a UI message id resolved from matches' i18n payload. */
  titleKey?: UiMessageId
  description?: string
  pageUrl?: string
  ogImageUrl?: string
  ogImageAltText?: string
  variant?: SeoVariant
  canonical?: boolean
  prevUrl?: string
  nextUrl?: string
  noindex?: boolean
  feedLinks?: FeedLinkOptions
}

function absoluteUrl(url: string | undefined, website: string): string | undefined {
  if (!url) {
    return undefined
  }
  return url.startsWith('http') ? url : website + url
}

function resolveOgImage(
  website: string,
  ogImageUrl: string | undefined,
  branding: SiteAssetBranding | null | undefined,
): string {
  if (ogImageUrl === undefined) {
    return joinUrl(website, 'images/open-graph.png') + brandingVersionSuffix(branding?.openGraph)
  }
  return ogImageUrl.startsWith('http') ? ogImageUrl : joinUrl(website, ogImageUrl)
}

function ensureTwitterHandle(handle?: string): string | undefined {
  if (handle === undefined || handle === '') {
    return undefined
  }
  return handle.startsWith('@') ? handle : `@${handle}`
}

export function pageTitle(title?: string, bundle?: BlogSettingsBundle | null): string {
  const resolved = bundle ?? getBlogSettingsBundleSync()
  const siteIdentity = resolved?.siteIdentity
  if (siteIdentity === null || siteIdentity === undefined) {
    return title ?? fallbackMessages['meta.preinstall']
  }
  return title === undefined
    ? `${siteIdentity.title} ${siteIdentity.titleSeparator} ${siteIdentity.description}`
    : `${title} ${siteIdentity.titleSeparator} ${siteIdentity.title}`
}

function baseTags(
  title: string,
  description: string,
  config: {
    title: string
    author: { name: string; url: string }
    keywords: string[]
    website: string
  },
  branding?: SiteAssetBranding | null,
): MetaDescriptor[] {
  return [
    { title },
    { name: 'title', content: title },
    { name: 'description', content: description },
    { name: 'author', content: config.author.name },
    { tagName: 'link', rel: 'author', href: config.author.url },
    { name: 'keywords', content: config.keywords.join(',') },
    {
      tagName: 'link',
      rel: 'alternate',
      type: 'application/rss+xml',
      title: config.title,
      href: `${config.website}/feed/`,
    },
    {
      tagName: 'link',
      rel: 'alternate',
      type: 'application/atom+xml',
      title: config.title,
      href: `${config.website}/feed/atom/`,
    },
    { tagName: 'link', rel: 'sitemap', href: `${config.website}/sitemap.xml` },
    {
      tagName: 'link',
      rel: 'icon',
      href: `/favicon.ico${brandingVersionSuffix(branding?.faviconIco)}`,
      sizes: '32x32',
    },
    {
      tagName: 'link',
      rel: 'icon',
      href: `/favicon.svg${brandingVersionSuffix(branding?.faviconSvg)}`,
      type: 'image/svg+xml',
    },
    {
      tagName: 'link',
      rel: 'apple-touch-icon',
      href: `/apple-touch-icon.png${brandingVersionSuffix(branding?.appleTouchIcon)}`,
    },
    { tagName: 'link', rel: 'manifest', href: '/manifest.webmanifest' },
  ]
}

function robotsTags(noindex: boolean): MetaDescriptor[] {
  return [
    { name: 'robots', content: noindex ? 'noindex,follow' : 'index, follow' },
    {
      name: 'googlebot',
      content: noindex
        ? 'noindex,follow'
        : 'index, follow, max-video-preview:-1, max-image-preview:large, max-snippet:-1',
    },
  ]
}

function ogTags(
  args: {
    variant: SeoVariant
    title: string
    description: string
    pageUrl: string
    imageUrl: string
    imageAlt: string
  },
  locale: string,
  og: { width: number; height: number },
): MetaDescriptor[] {
  const type = args.variant.kind === 'website' ? 'website' : 'article'
  const meta: MetaDescriptor[] = [
    { property: 'og:type', content: type },
    { property: 'og:locale', content: locale },
    { property: 'og:title', content: args.title },
    { property: 'og:description', content: args.description },
    { property: 'og:url', content: args.pageUrl },
    { property: 'og:image', content: args.imageUrl },
    { property: 'og:image:alt', content: args.imageAlt },
  ]
  if (og.width) {
    meta.push({ property: 'og:image:width', content: String(og.width) })
  }
  if (og.height) {
    meta.push({ property: 'og:image:height', content: String(og.height) })
  }
  return meta
}

function twitterTags(
  args: {
    title: string
    description: string
    imageUrl: string
    imageAlt: string
  },
  twitter: string | undefined,
): MetaDescriptor[] {
  const site = ensureTwitterHandle(twitter)
  const meta: MetaDescriptor[] = [
    { property: 'twitter:title', content: args.title },
    { property: 'twitter:description', content: args.description },
  ]
  if (site) {
    meta.push({ property: 'twitter:site', content: site }, { property: 'twitter:creator', content: site })
  }
  meta.push(
    { property: 'twitter:card', content: 'summary_large_image' },
    { property: 'twitter:image', content: args.imageUrl },
    { property: 'twitter:image:alt', content: args.imageAlt },
  )
  return meta
}

function articleTags(variant: SeoVariant, authorName: string, i18n?: SeoI18n | null): MetaDescriptor[] {
  if (variant.kind === 'website') {
    return []
  }

  const meta: MetaDescriptor[] = []
  if (variant.article.updated) {
    meta.push({ property: 'article:modified_time', content: toIsoString(variant.article.updated) })
  }
  meta.push(
    { property: 'article:published_time', content: toIsoString(variant.article.date) },
    { property: 'article:author', content: authorName },
  )
  // A page's section is system copy (localized); a post's is its category (content).
  // An uncategorized post has no section — emit nothing rather than content="".
  const section =
    variant.kind === 'page'
      ? (i18n?.messages['meta.section.page'] ?? fallbackMessages['meta.section.page'])
      : variant.article.category
  if (section !== undefined && section !== '') {
    meta.push({ property: 'article:section', content: section })
  }
  if (variant.kind === 'post') {
    for (const tag of variant.article.tags ?? []) {
      meta.push({ property: 'article:tag', content: tag })
    }
  }
  return meta
}

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}

export interface PostMetaShape {
  title: string
  slug: string
  summary: string
  permalink: string
  og?: string
  date: Date | string
  updated?: Date | string
  category: string
  tags: string[]
}

export function seoForPost(post: PostMetaShape): RouteSeoOptions {
  return {
    title: post.title,
    description: post.summary,
    pageUrl: post.permalink,
    ogImageUrl: post.og ? post.og : ogImagePathForSlug(post.slug),
    ogImageAltText: post.title,
    variant: {
      kind: 'post',
      article: {
        date: post.date,
        updated: post.updated,
        category: post.category,
        tags: post.tags,
      },
    },
    canonical: true,
  }
}

export interface PageMetaShape {
  title: string
  slug: string
  summary: string
  permalink: string
  og?: string
  date: Date | string
  updated?: Date | string
}

export function seoForPage(page: PageMetaShape): RouteSeoOptions {
  return {
    title: page.title,
    description: page.summary,
    pageUrl: page.permalink,
    ogImageUrl: page.og ? page.og : ogImagePathForSlug(page.slug),
    ogImageAltText: page.title,
    variant: {
      kind: 'page',
      article: { date: page.date, updated: page.updated },
    },
    canonical: true,
  }
}

/**
 * Static titles arrive as message ids and resolve ONLY from the root loader's
 * i18n payload (works on client navigation, where no server translator exists).
 * Raw content titles pass through untouched.
 */
function resolveTitle(
  title: string | undefined,
  titleKey: UiMessageId | undefined,
  i18n: SeoI18n | null | undefined,
): string | undefined {
  if (title !== undefined) {
    return title
  }
  if (titleKey === undefined) {
    return undefined
  }
  return i18n?.messages[titleKey]
}

export function routeMeta(
  {
    title,
    titleKey,
    description,
    pageUrl,
    ogImageUrl,
    ogImageAltText,
    variant = { kind: 'website' },
    canonical = false,
    prevUrl,
    nextUrl,
    noindex = false,
    feedLinks,
  }: RouteSeoOptions = {},
  bundle?: BlogSettingsBundle | null,
  i18n?: SeoI18n | null,
): MetaDescriptor[] {
  const resolved = bundle ?? getBlogSettingsBundleSync()
  const siteIdentity = resolved?.siteIdentity
  const rawTitle = resolveTitle(title, titleKey, i18n)
  if (resolved === null || siteIdentity === null || siteIdentity === undefined) {
    // Pre-install (or root loader failed): emit a minimal `<title>` and
    // noindex; the fallback module is the last-resort language source, never a
    // bare literal or another catalog.
    return [
      { title: rawTitle ?? i18n?.messages['meta.preinstall'] ?? fallbackMessages['meta.preinstall'] },
      ...robotsTags(true),
    ]
  }

  const seo = resolved.seo ?? {
    og: { width: 0, height: 0 },
    toc: { minHeadingLevel: 2, maxHeadingLevel: 4 },
  }
  const socials = resolved.socials ?? { socials: [] }

  const resolvedTitle = pageTitle(rawTitle, resolved)
  const resolvedDescription = description || siteIdentity.description
  const resolvedPageUrl = absoluteUrl(pageUrl, siteIdentity.website) || siteIdentity.website
  const imageUrl = resolveOgImage(siteIdentity.website, ogImageUrl, resolved?.assets?.branding)
  const imageAlt = ogImageAltText || resolvedTitle

  const meta: MetaDescriptor[] = [
    ...baseTags(resolvedTitle, resolvedDescription, siteIdentity, resolved?.assets?.branding),
    ...robotsTags(noindex),
    ...ogTags(
      {
        variant,
        title: resolvedTitle,
        description: resolvedDescription,
        pageUrl: resolvedPageUrl,
        imageUrl,
        imageAlt,
      },
      toOpenGraphLocale(siteIdentity.locale),
      seo.og,
    ),
    ...articleTags(variant, siteIdentity.author.name, i18n),
    ...twitterTags(
      { title: resolvedTitle, description: resolvedDescription, imageUrl, imageAlt },
      extractXHandle(socials.socials),
    ),
  ]

  if (canonical) {
    meta.push({ tagName: 'link', rel: 'canonical', href: resolvedPageUrl })
  }
  const prevHref = absoluteUrl(prevUrl, siteIdentity.website)
  if (prevHref) {
    meta.push({ tagName: 'link', rel: 'prev', href: prevHref })
  }
  const nextHref = absoluteUrl(nextUrl, siteIdentity.website)
  if (nextHref) {
    meta.push({ tagName: 'link', rel: 'next', href: nextHref })
  }

  if (feedLinks) {
    const feedTitle = feedLinks.title ?? resolvedTitle
    const rssHref = absoluteUrl(feedLinks.rss, siteIdentity.website)
    if (rssHref) {
      meta.push({
        tagName: 'link',
        rel: 'alternate',
        type: 'application/rss+xml',
        title: feedTitle,
        href: rssHref,
      })
    }
    const atomHref = absoluteUrl(feedLinks.atom, siteIdentity.website)
    if (atomHref) {
      meta.push({
        tagName: 'link',
        rel: 'alternate',
        type: 'application/atom+xml',
        title: feedTitle,
        href: atomHref,
      })
    }
  }

  return meta
}

interface RootLoaderData {
  blogSettings?: BlogSettingsBundle | null
  i18n?: unknown
}

function isRootLoaderData(value: unknown): value is RootLoaderData {
  if (!isRecord(value)) {
    return false
  }
  const bs = value.blogSettings
  return bs === undefined || bs === null || isRecord(bs)
}

function rootLoaderData(matches: readonly unknown[]): RootLoaderData | undefined {
  const rootMatch = matches.find((m) => isRecord(m) && m.id === 'root')
  if (!isRecord(rootMatch) || !isRootLoaderData(rootMatch.loaderData)) {
    return undefined
  }
  return rootMatch.loaderData
}

export function bundleFromMatches(matches: readonly unknown[]): BlogSettingsBundle | null | undefined {
  const rootLoader = rootLoaderData(matches)
  if (rootLoader === undefined) {
    return undefined
  }
  return rootLoader.blogSettings ?? null
}

/**
 * The root loader's i18n payload, validated structurally. `meta()` resolves
 * static titles and system section labels from HERE — the only source that
 * exists on both SSR and client navigation.
 */
export function i18nFromMatches(matches: readonly unknown[]): SeoI18n | null {
  const candidate = rootLoaderData(matches)?.i18n
  if (!isRecord(candidate)) {
    return null
  }
  const { locale, messages } = candidate
  if (typeof locale !== 'string' || !isSupportedLocale(locale) || !isRecord(messages)) {
    return null
  }
  for (const value of Object.values(messages)) {
    if (typeof value !== 'string') {
      return null
    }
  }
  return { locale, messages: unsafeCast<Readonly<Record<string, string>>>(messages) }
}

export function metaWithFallback({
  loaderData,
  matches,
  fallback,
}: {
  loaderData: { seo?: MetaDescriptor[] } | undefined
  matches: readonly unknown[]
  fallback?: (bundle: BlogSettingsBundle | null | undefined) => MetaDescriptor[]
}): MetaDescriptor[] {
  const seo = loaderData?.seo
  if (seo !== undefined && seo.length > 0) {
    return seo
  }

  const bundle = bundleFromMatches(matches)
  if (fallback !== undefined) {
    return fallback(bundle)
  }
  return routeMeta(undefined, bundle, i18nFromMatches(matches))
}
