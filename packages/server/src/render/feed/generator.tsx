import type { Page, Post } from '@kobato/catalog/model'
import type { Database } from '@kobato/db/sqlite/database'
import type { AppLocale } from '@kobato/i18n/locales'
import type { BlogSettingsBundle } from '@kobato/settings/types'

import { ogImagePathForSlug } from '@kobato/catalog/seo/og-image'
import { findCategoriesByNames } from '@kobato/db/sqlite/operations/taxonomy/category'
import { sanitizeHtmlString } from '@kobato/sanitize/sanitize-html'
import { resolveBodyHtmlFeed } from '@kobato/server/domains/content/services/body-html'
import { selectFeedPosts } from '@kobato/server/domains/posts/services/feed'
import {
  listAllCategories,
  resolveCategoryBySlugOrName,
} from '@kobato/server/domains/taxonomies/categories/services/query'
import { getTagsByNames, resolveTagBySlugOrName } from '@kobato/server/domains/taxonomies/tags/service'
import { DomainError } from '@kobato/server/infra/http/errors'
import { getBlogSettingsBundleSync, requireBlogSettingsSection } from '@kobato/settings/getters'
import { brandingVersionSuffix } from '@kobato/settings/presentation'
import { joinUrl } from '@kobato/utils/urls'
import { Feed } from 'feed'

export interface FeedOptions {
  locale: AppLocale
  category?: string
  tag?: string
  settings?: BlogSettingsBundle | null
}

export function sanitizeFeedHtml(html: string): string {
  return sanitizeHtmlString(html, 'feed')
}

export function escapeCdataPayload(value: string): string {
  return value.replaceAll(']]>', ']]&gt;')
}

async function renderEntryContent(entry: Post | Page): Promise<string> {
  const html = await resolveBodyHtmlFeed(entry)
  return escapeCdataPayload(sanitizeFeedHtml(html))
}

export async function generateFeeds(db: Database, options: FeedOptions) {
  const siteIdentity = requireBlogSettingsSection('siteIdentity', options.settings)
  const content = requireBlogSettingsSection('content', options.settings)
  const branding = (options.settings === undefined ? getBlogSettingsBundleSync() : options.settings)?.assets?.branding
  const { category, tag, locale } = options
  if (category !== undefined && tag !== undefined) {
    throw new DomainError('BAD_REQUEST', 'Category and tag cannot be specified at the same time')
  }
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
    language: locale,
    image: joinUrl(siteIdentity.website, `/logo.svg${brandingVersionSuffix(branding?.logoSvg)}`),
    favicon: joinUrl(siteIdentity.website, `/favicon.svg${brandingVersionSuffix(branding?.faviconSvg)}`),
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
  })

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
      title: escapeCdataPayload(post.title),
      id: joinUrl(siteIdentity.website, post.permalink),
      link: joinUrl(siteIdentity.website, post.permalink),
      description: escapeCdataPayload(post.summary),
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
    atom: feed
      .atom1()
      .replace(
        '<feed xmlns="http://www.w3.org/2005/Atom">',
        `<feed xml:lang="${locale}" xmlns="http://www.w3.org/2005/Atom">`,
      ),
  }
}
