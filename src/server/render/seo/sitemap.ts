import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { listAllPages } from '@/server/domains/pages/repo'
import { listAllPosts } from '@/server/domains/posts/repos/public-query'
import { requireBlogSettingsSection } from '@/shared/config/getters'
import { joinUrl } from '@/shared/utils/urls'

export async function buildSitemapXml(db: NodePgDatabase, _request: Request): Promise<string> {
  const [posts, pages] = await Promise.all([
    listAllPosts(db, { includeHidden: true, includeScheduled: false }),
    listAllPages(db),
  ])

  // Build via array join so the response starts with `<?xml ... ?>` on the
  // first byte. The previous template-literal version left a leading newline
  // which some validators reject.
  const website = requireBlogSettingsSection('siteIdentity').website
  const lines: string[] = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    `  <url><loc>${website}/</loc></url>`,
  ]
  for (const post of posts) {
    lines.push(
      `  <url><loc>${joinUrl(website, post.permalink)}</loc><lastmod>${post.date.toISOString()}</lastmod></url>`,
    )
  }
  for (const page of pages) {
    lines.push(
      `  <url><loc>${joinUrl(website, page.permalink)}</loc><lastmod>${page.date.toISOString()}</lastmod></url>`,
    )
  }
  lines.push('</urlset>')

  return lines.join('\n')
}
