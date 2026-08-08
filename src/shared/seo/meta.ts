import type { MetaDescriptor } from 'react-router'

import type { BlogSettingsBundle } from '@/shared/config/types'

// Isomorphic by construction: route `meta()` exports pull this module
// into the browser bundle, so it may only import `@/shared/*`.
import { getBlogSettingsBundleSync } from '@/shared/config/getters'
import { brandingVersion, extractXHandle } from '@/shared/config/utils'
import { ogImagePathForSlug } from '@/shared/seo/og-image'
import { isRecord } from '@/shared/utils/type-guards'
import { joinUrl } from '@/shared/utils/urls'

const PRE_INSTALL_TITLE = '正在安装'

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
    // Pre-install fallback: the split-screen renders before settings
    // exist — emit a minimal `<title>` and noindex.
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

function isRootLoaderData(value: unknown): value is RootLoaderData {
  if (!isRecord(value)) {
    return false
  }
  const bs = value.blogSettings
  return bs === undefined || bs === null || isRecord(bs)
}

export function bundleFromMatches(matches: readonly unknown[]): BlogSettingsBundle | null | undefined {
  const rootMatch = matches.find((m) => {
    if (!isRecord(m)) {
      return false
    }
    return m.id === 'root'
  })
  if (!isRecord(rootMatch)) {
    return undefined
  }
  const rootLoader = rootMatch.loaderData
  if (!isRootLoaderData(rootLoader)) {
    return undefined
  }
  return rootLoader.blogSettings ?? null
}

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
