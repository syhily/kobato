import type { Database } from '@kobato/db/database.ts'
import type { BlogSettingsBundle } from '@kobato/settings/types.ts'

import { listSitemapPages } from '@kobato/server/domains/pages/services/public-query.ts'
import { listSitemapPosts } from '@kobato/server/domains/posts/services/public-query.ts'
import { requireBlogSettingsSection } from '@kobato/settings/getters.ts'
import { joinUrl } from '@kobato/utils/urls.ts'

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export async function buildSitemapXml(db: Database, settings: BlogSettingsBundle | null): Promise<string> {
  const [posts, pages] = await Promise.all([listSitemapPosts(db), listSitemapPages(db)])

  const website = requireBlogSettingsSection('siteIdentity', settings).website
  const lines: string[] = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    `  <url><loc>${escapeXml(website)}/</loc></url>`,
  ]
  for (const post of posts) {
    const date = post.firstPublishedAt ?? post.publishedAt
    lines.push(
      `  <url><loc>${escapeXml(joinUrl(website, `/posts/${post.slug}`))}</loc><lastmod>${date.toISOString()}</lastmod></url>`,
    )
  }
  for (const page of pages) {
    const date = page.firstPublishedAt ?? page.publishedAt
    lines.push(
      `  <url><loc>${escapeXml(joinUrl(website, `/${page.slug}`))}</loc><lastmod>${date.toISOString()}</lastmod></url>`,
    )
  }
  lines.push('</urlset>')

  return lines.join('\n')
}
