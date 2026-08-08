import type { Database } from '@/server/infra/db/database'

import { listSitemapPages } from '@/server/domains/pages/services/public-query'
import { listSitemapPosts } from '@/server/domains/posts/services/public-query'
import { requireBlogSettingsSection } from '@/shared/config/getters'
import { joinUrl } from '@/shared/utils/urls'

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export async function buildSitemapXml(db: Database): Promise<string> {
  const [posts, pages] = await Promise.all([listSitemapPosts(db), listSitemapPages(db)])

  // Array join so the response starts with `<?xml ... ?>` on the first byte.
  const website = requireBlogSettingsSection('siteIdentity').website
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
