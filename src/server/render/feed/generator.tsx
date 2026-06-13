import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { Feed } from 'feed'

import type { Page, Post } from '@/shared/types/catalog'

import { listPublicPostsWithContent } from '@/server/domains/posts/repos/public-query/feed'
import {
  findCategoriesByNames,
  findCategoryByName,
  findCategoryBySlug,
  listAllCategories,
} from '@/server/domains/taxonomies/categories/services/query'
import { findTagByName, findTagBySlug, getTagsByNames } from '@/server/domains/taxonomies/tags/service'
import { feedCacheFor } from '@/server/infra/cache/feed-cache'
import { DomainError } from '@/server/infra/http/errors'
import { renderPortableTextToHtml } from '@/server/render/feed/feed-pt-render'
import { requireBlogSettingsSection } from '@/shared/config/getters'
import { joinUrl } from '@/shared/utils/urls'

export interface FeedOptions {
  includeHidden?: boolean
  includeScheduled?: boolean
  size?: number
  category?: string
  tag?: string
}

const CONTENT_TYPES = {
  rss: 'application/xml; charset=utf-8',
  atom: 'application/atom+xml; charset=utf-8',
} as const

// Centralised cache headers for syndication feeds. Routes that re-export this
// from a `headers()` route module function will get cache-friendly behaviour
// without re-stating the policy.
export function feedHeaders(kind: 'rss' | 'atom'): HeadersInit {
  return {
    'Content-Type': CONTENT_TYPES[kind],
    'Cache-Control': 'public, max-age=1800',
  }
}

export async function feedResponse(
  db: NodePgDatabase,
  kind: 'rss' | 'atom',
  filter?: Pick<FeedOptions, 'category' | 'tag'>,
): Promise<Response> {
  const feed = await generateFeeds(db, filter ?? {})
  const body = kind === 'rss' ? feed.rss : feed.atom
  return new Response(body, { headers: feedHeaders(kind) })
}

// Minimal server-side HTML sanitizer for feed output. Strips script tags,
// event handler attributes, and javascript: URLs since feed HTML is served
// to external aggregators without additional filtering.
function sanitizeFeedHtml(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|`[^`]*`|[^\s>]*)/gi, '')
    .replace(/(href|src|action)\s*=\s*"\s*javascript:[^"]*"/gi, '$1="#"')
    .replace(/(href|src|action)\s*=\s*'\s*javascript:[^']*'/gi, "$1='#'")
}

async function renderEntryContent(db: NodePgDatabase, entry: Post | Page): Promise<string> {
  // Feed items ship as HTML (RSS/Atom can't carry a React tree). We prerender
  // the body but skip the image-enhancement pipeline: feed readers don't
  // need thumbhash placeholders or DB-resolved dimensions.
  //
  // `rssMode` degrades interactive blocks (musicPlayer, etc.) to static HTML
  // so feed readers without JavaScript still get meaningful content.
  // Both pages and posts now live in Postgres and carry a PortableText body.
  const html = await renderPortableTextToHtml(
    db,
    entry.body,
    entry.headings.map((h) => h.slug),
    { rssMode: true },
  )
  return sanitizeFeedHtml(html)
}

export async function generateFeeds(db: NodePgDatabase, options: FeedOptions = {}) {
  const cacheKey = options.category ?? options.tag ?? 'all'
  const feedCache = feedCacheFor(cacheKey)
  const cached = await feedCache.get()
  if (cached !== null) {
    return cached
  }

  const siteIdentity = requireBlogSettingsSection('siteIdentity')
  const content = requireBlogSettingsSection('content')
  const { includeHidden = true, includeScheduled = false, size = content.feed.size, category, tag } = options
  if (category !== undefined && tag !== undefined) {
    throw new DomainError('BAD_REQUEST', 'Category and tag cannot be specified at the same time')
  }
  const feedPosts = await selectFeedPosts(db, { includeHidden, includeScheduled, category, tag, limit: size })

  // Start to build the feed.
  const feed = new Feed({
    title: siteIdentity.title,
    description: siteIdentity.description,
    id: siteIdentity.website,
    link: siteIdentity.website,
    language: 'zh-CN',
    image: joinUrl(siteIdentity.website, '/logo.svg'),
    favicon: joinUrl(siteIdentity.website, '/favicon.svg'),
    copyright: `All rights reserved ${siteIdentity.initialYear}, ${siteIdentity.author.name}`,
    updated: new Date(),
    feedLinks: {
      rss: `${siteIdentity.website}${category ? `/cats/${category}` : ''}${tag ? `/tags/${tag}` : ''}/feed`,
      atom: `${siteIdentity.website}${category ? `/cats/${category}` : ''}${tag ? `/tags/${tag}` : ''}/feed/atom/`,
    },
    author: {
      name: siteIdentity.author.name,
      email: siteIdentity.author.email,
      link: siteIdentity.author.url,
    },
    // Intentionally no `stylesheet` / `<?xml-stylesheet?>`: browsers are
    // deprecating XSLT for XML documents (Chrome et al.); aggregators ignore it.
  })

  // Batch-resolve tags and categories so we don't N+1 inside the loop.
  const allTagNames = [...new Set(feedPosts.flatMap((p) => p.tags))]
  const allCategoryNames = [...new Set(feedPosts.map((p) => p.category).filter(Boolean))]

  const [allTags, allCategories, contents] = await Promise.all([
    getTagsByNames(db, allTagNames),
    findCategoriesByNames(db, allCategoryNames),
    Promise.all(feedPosts.map((post) => renderEntryContent(db, post))),
  ])

  const tagMap = new Map(allTags.map((t) => [t.name, t]))
  const catMap = new Map(allCategories.filter((c): c is NonNullable<typeof c> => Boolean(c)).map((c) => [c.name, c]))

  for (let i = 0; i < feedPosts.length; i++) {
    const post = feedPosts[i]
    const itemCategories = post.tags
      .map((name) => tagMap.get(name))
      .filter((t): t is NonNullable<typeof t> => Boolean(t))
      .map((t) => ({
        name: t.name,
        domain: joinUrl(siteIdentity.website, `/tags/${t.slug}`),
        scheme: 'https',
        term: t.name,
      }))
    const postCategory = post.category ? (catMap.get(post.category) ?? null) : null
    if (postCategory !== null) {
      itemCategories.push({
        name: postCategory.name,
        domain: joinUrl(siteIdentity.website, `/cats/${postCategory.slug}`),
        scheme: 'https',
        term: postCategory.name,
      })
    }
    feed.addItem({
      title: post.title,
      id: joinUrl(siteIdentity.website, post.permalink),
      link: joinUrl(siteIdentity.website, post.permalink),
      description: post.summary,
      content: contents[i],
      author: [
        {
          name: siteIdentity.author.name,
          email: siteIdentity.author.email,
          link: siteIdentity.author.url,
        },
      ],
      date: post.date,
      image: post.og
        ? joinUrl(siteIdentity.website, post.og)
        : joinUrl(siteIdentity.website, `/images/og/${post.slug}.png`),
      category: itemCategories,
    })
  }

  const categories = await listAllCategories(db)
  for (const cat of categories) {
    feed.addCategory(cat.name)
  }

  const result = {
    rss: feed.rss2(),
    // Hotfix the adding the xml:lang attribute to the atom feed
    atom: feed
      .atom1()
      .replace(
        '<feed xmlns="http://www.w3.org/2005/Atom">',
        '<feed xml:lang="zh-CN" xmlns="http://www.w3.org/2005/Atom">',
      ),
  }

  await feedCache.set(result)
  return result
}

async function selectFeedPosts(
  db: NodePgDatabase,
  options: Pick<FeedOptions, 'category' | 'tag'> & {
    includeHidden: boolean
    includeScheduled: boolean
    limit?: number
  },
): Promise<Post[]> {
  const visibility = {
    includeHidden: options.includeHidden,
    includeScheduled: options.includeScheduled,
    limit: options.limit,
  }

  if (options.category !== undefined) {
    const category =
      (await findCategoryBySlug(db, options.category)) ?? (await findCategoryByName(db, options.category))
    if (category === null) {
      return []
    }
    return listPublicPostsWithContent(db, { ...visibility, category: category.name })
  }

  if (options.tag !== undefined) {
    const tag = (await findTagBySlug(db, options.tag)) ?? (await findTagByName(db, options.tag))
    if (tag === null) {
      return []
    }
    return listPublicPostsWithContent(db, { ...visibility, tag: tag.name })
  }

  return listPublicPostsWithContent(db, visibility)
}
