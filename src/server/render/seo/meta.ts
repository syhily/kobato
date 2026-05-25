import type { MetaDescriptor } from 'react-router'

// IMPORTANT: this module is imported by every route's `meta()` export
// and `meta()` runs on the client too (after client-side navigation).
// That means anything imported here ends up in the client bundle, so
// we read settings through the **shared** snapshot reader on SSR — never
// through `@/server/*`, which would drag Drizzle/Postgres into the
// browser.
//
// On the server the snapshot is hydrated once at boot by the settings
// service. On the client we no longer keep a parallel `globalThis`
// snapshot in sync — instead, every `meta()` callback reads the bundle
// from `Route.MetaArgs.matches[0].data.blogSettings` (the root
// loader's payload). `metaWithFallback` is the canonical helper that
// performs that extraction, but per-route `meta()` callbacks can also
// pass an explicit `bundle` to `routeMeta()` / `pageTitle()`.
//
// A `null` bundle is possible only on the install split-screen (the
// install gate intercepts every other path); each helper handles it
// defensively.
import type { BlogSettingsBundle } from '@/shared/config/types'

import { getBlogSettingsBundleSync } from '@/shared/config/getters'
import { brandingVersion, extractXHandle } from '@/shared/config/utils'
import { joinUrl } from '@/shared/utils/urls'

// Minimal sentinel rendered before the install flow has populated the
// settings row. The admin SPA never reaches `routeMeta` (it owns its
// own meta), so the only consumer is the install split-screen — a few
// generic tags is plenty until the editor finishes installing.
const PRE_INSTALL_TITLE = '正在安装'

interface ArticleSeo {
  date: Date | string
  updated?: Date | string
  category?: string
  tags?: string[]
}

type SeoVariant = { kind: 'page'; article: ArticleSeo } | { kind: 'post'; article: ArticleSeo } | { kind: 'website' }

export interface FeedLinkOptions {
  /** RSS feed URL (absolute or root-relative). */
  rss?: string
  /** Atom feed URL (absolute or root-relative). */
  atom?: string
  /**
   * Optional `<link title>` shown by feed readers. When omitted, falls back
   * to the page title so readers can distinguish per-category/per-tag feeds
   * from the site-wide one.
   */
  title?: string
}

export interface RouteSeoOptions {
  title?: string
  description?: string
  pageUrl?: string
  ogImageUrl?: string
  ogImageAltText?: string
  variant?: SeoVariant
  canonical?: boolean
  prevUrl?: string
  nextUrl?: string
  noindex?: boolean
  /**
   * Additional `<link rel="alternate">` entries advertising scoped feeds
   * (per-category, per-tag, …). These append to — never replace — the
   * site-wide feeds emitted by `baseTags()`.
   */
  feedLinks?: FeedLinkOptions
}

function absoluteUrl(url: string | undefined, website: string): string | undefined {
  if (!url) {
    return undefined
  }
  return url.startsWith('http') ? url : website + url
}

function resolveOgImage(website: string, ogImageUrl?: string): string {
  if (ogImageUrl === undefined) {
    return joinUrl(website, 'images/open-graph.png')
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
    return title ?? PRE_INSTALL_TITLE
  }
  return title === undefined
    ? `${siteIdentity.title} - ${siteIdentity.description}`
    : `${title} - ${siteIdentity.title}`
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
  v?: string,
): MetaDescriptor[] {
  const qs = v ? `?v=${v}` : ''
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
    { tagName: 'link', rel: 'icon', href: `/favicon.ico${qs}`, sizes: '32x32' },
    { tagName: 'link', rel: 'icon', href: `/favicon.svg${qs}`, type: 'image/svg+xml' },
    { tagName: 'link', rel: 'apple-touch-icon', href: `/apple-touch-icon.png${qs}` },
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

function articleTags(variant: SeoVariant, authorName: string): MetaDescriptor[] {
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
    {
      property: 'article:section',
      content: variant.kind === 'page' ? '页面' : (variant.article.category ?? ''),
    },
  )
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

// Pure helpers consumed by detail-page `meta()` callbacks. Shaping the SEO
// payload here means detail loaders no longer need to ship a denormalised
// `seo: {...}` field over the wire on every client navigation — `meta()`
// reads the post/page directly and projects it into `RouteSeoOptions`.
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
    ogImageUrl: post.og ? post.og : `/images/og/${post.slug}.png`,
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
    ogImageUrl: page.og ? page.og : `/images/og/${page.slug}.png`,
    ogImageAltText: page.title,
    variant: {
      kind: 'page',
      article: { date: page.date, updated: page.updated },
    },
    canonical: true,
  }
}

export function routeMeta(
  {
    title,
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
): MetaDescriptor[] {
  const resolved = bundle ?? getBlogSettingsBundleSync()
  const siteIdentity = resolved?.siteIdentity
  if (resolved === null || siteIdentity === null || siteIdentity === undefined) {
    // Pre-install fallback. The install split-screen renders before the
    // gate has any settings to hand out; emit a minimal `<title>` so
    // browsers don't show "untitled" and call it a day.
    return [{ title: title ?? PRE_INSTALL_TITLE }, ...robotsTags(true)]
  }

  const seo = resolved.seo ?? {
    og: { width: 0, height: 0 },
    toc: { minHeadingLevel: 2, maxHeadingLevel: 4 },
  }
  const socials = resolved.socials ?? { socials: [] }

  const resolvedTitle = pageTitle(title, resolved)
  const resolvedDescription = description || siteIdentity.description
  const resolvedPageUrl = absoluteUrl(pageUrl, siteIdentity.website) || siteIdentity.website
  const imageUrl = resolveOgImage(siteIdentity.website, ogImageUrl)
  const imageAlt = ogImageAltText || resolvedTitle

  const meta: MetaDescriptor[] = [
    ...baseTags(resolvedTitle, resolvedDescription, siteIdentity, brandingVersion(resolved?.assets?.branding)),
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
      siteIdentity.locale,
      seo.og,
    ),
    ...articleTags(variant, siteIdentity.author.name),
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
}

// Match shape minimally compatible with `Route.MetaArgs.matches`.
// Per-route `Route.MetaArgs.matches` is a readonly tuple of richly
// typed match descriptors (with `id: "root"` literal types and
// branded `data`). We only need `id` and `data` to read the root
// match — accept anything that exposes those fields via `unknown`,
// then narrow at the call site.
//
// Why `unknown` instead of a structural object: React Router's
// per-route match tuples are NOT assignable to a wider object array
// because of TypeScript variance (readonly tuples preserve element
// literal types like `id: "root"` that don't widen to `string`).
// `unknown[]` accepts the tuple without a manual `as` cast at the
// route, which is the whole point of this helper.

/**
 * Extract the `BlogSettingsBundle` the root loader handed down so a
 * route's `meta()` can read it without touching `globalThis`. Returns
 * `undefined` when there's no root match in scope (which only happens
 * during the install split-screen, where the meta defaults already
 * cover us).
 *
 * `meta()` runs on the client after a client-side navigation, before
 * the root component re-mounts and any React-side context updates
 * land. Passing the bundle explicitly through `matches` is the
 * standard React Router pattern and replaces the previous
 * `globalThis`-snapshot pump in `App` / `metaWithFallback`.
 */
export function bundleFromMatches(matches: readonly unknown[]): BlogSettingsBundle | null | undefined {
  const rootMatch = matches.find(
    (m): m is { id: string; data: unknown } =>
      typeof m === 'object' && m !== null && (m as { id?: unknown }).id === 'root',
  )
  const rootLoader = rootMatch?.data as RootLoaderData | undefined
  if (rootLoader === undefined) {
    return undefined
  }
  return rootLoader.blogSettings ?? null
}

/**
 * Helper for routes whose loader optionally pre-computes a `seo`
 * descriptor array (`listingSeo()`, `seoForPost()`, …). When the
 * loader produced one, it wins; otherwise this falls back to
 * `routeMeta()` with the bundle pulled out of `matches`.
 *
 * Centralising this glue keeps every listing route's `meta()` body to
 * a single line and ensures the bundle lookup can't go missing on a
 * future route.
 *
 * Pass an explicit `fallback` factory when the route wants to hand
 * `routeMeta()` extra options (e.g. a custom title); the factory
 * receives the resolved bundle so callers don't have to extract it a
 * second time.
 */
export function metaWithFallback<TLoader extends { seo?: MetaDescriptor[] } | undefined>({
  loaderData,
  matches,
  fallback,
}: {
  loaderData: TLoader
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
  return routeMeta(undefined, bundle)
}
