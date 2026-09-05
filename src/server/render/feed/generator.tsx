import { Feed } from 'feed'

import type { Database } from '@/server/infra/db/database'
import type { Page, Post } from '@/shared/types/catalog'

import { resolveBodyHtmlFeed } from '@/server/domains/content/services/body-html'
import { selectFeedPosts } from '@/server/domains/posts/services/feed'
import { listAllCategories, resolveCategoryBySlugOrName } from '@/server/domains/taxonomies/categories/services/query'
import { getTagsByNames, resolveTagBySlugOrName } from '@/server/domains/taxonomies/tags/service'
import { findCategoriesByNames } from '@/server/infra/db/operations/category'
import { DomainError } from '@/server/infra/http/errors'
import { requireBlogSettingsSection } from '@/shared/config/getters'
import { sanitizeHtmlString } from '@/shared/sanitize/sanitize-html'
import { ogImagePathForSlug } from '@/shared/seo/og-image'
import { joinUrl } from '@/shared/utils/urls'

export interface FeedOptions {
  category?: string
  tag?: string
}

// Allowlist HTML sanitizer for feed output — a thin wrapper over the shared
// DOMPurify stack's 'feed' strategy (src/shared/sanitize/config.ts owns the
// tag/attribute allowlist, which mirrors the feed-variant projection's real
// output: `infra/pt/lexical-projection` — inkling exportDOM, artifacts
// stripped).
export function sanitizeFeedHtml(html: string): string {
  return sanitizeHtmlString(html, 'feed')
}

async function renderEntryContent(entry: Post | Page): Promise<string> {
  // The saved `body_html_feed` projection already carries the rssMode
  // degradations (math→TeX, code→plain pre, host cards flattened) and
  // origin-absolutized media srcs; the sanitize allowlist below is the last
  // boundary before the XML.
  const html = await resolveBodyHtmlFeed(entry)
  return sanitizeFeedHtml(html)
}

export async function generateFeeds(db: Database, options: FeedOptions = {}) {
  const siteIdentity = requireBlogSettingsSection('siteIdentity')
  const content = requireBlogSettingsSection('content')
  const { category, tag } = options
  if (category !== undefined && tag !== undefined) {
    throw new DomainError('BAD_REQUEST', 'Category and tag cannot be specified at the same time')
  }
  // Visibility policy lives in the posts domain; the renderer wires the taxonomy resolvers only.
  const feedPosts = await selectFeedPosts(
    db,
    { category, tag, limit: content.feed.size },
    { resolveCategory: resolveCategoryBySlugOrName, resolveTag: resolveTagBySlugOrName },
  )

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
    // No XML stylesheet — browsers are deprecating XSLT for XML documents.
  })

  // Batch-resolve tags and categories so we don't N+1 inside the loop.
  const allTagNames = [...new Set(feedPosts.flatMap((p) => p.tags))]
  const allCategoryNames = [...new Set(feedPosts.map((p) => p.category).filter(Boolean))]

  const [allTags, allCategories, contents] = await Promise.all([
    getTagsByNames(db, allTagNames),
    findCategoriesByNames(db, allCategoryNames),
    Promise.all(feedPosts.map((post) => renderEntryContent(post))),
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
        term: t.name,
      }))
    const postCategory = post.category ? (catMap.get(post.category) ?? null) : null
    if (postCategory !== null) {
      itemCategories.push({
        name: postCategory.name,
        domain: joinUrl(siteIdentity.website, `/cats/${postCategory.slug}`),
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
        : joinUrl(siteIdentity.website, ogImagePathForSlug(post.slug)),
      category: itemCategories,
    })
  }

  const categories = await listAllCategories(db)
  for (const cat of categories) {
    feed.addCategory(cat.name)
  }

  return {
    rss: feed.rss2(),
    // Atom: inject the xml:lang attribute into the root element.
    atom: feed
      .atom1()
      .replace(
        '<feed xmlns="http://www.w3.org/2005/Atom">',
        '<feed xml:lang="zh-CN" xmlns="http://www.w3.org/2005/Atom">',
      ),
  }
}
