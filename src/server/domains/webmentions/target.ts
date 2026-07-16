import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { and, eq } from 'drizzle-orm'

import { entityPermalink } from '@/server/domains/comments/services/shared'
import { liveContentWhere } from '@/server/domains/content/schema'
import { page } from '@/server/infra/db/schema/page'
import { post } from '@/server/infra/db/schema/post'
import { requireBlogSettingsSection } from '@/shared/config/getters'
import { tryParseUrl } from '@/shared/utils/safe-url'

export interface WebmentionTarget {
  type: 'post' | 'page'
  ownerId: bigint
  slug: string
  title: string
  /** Canonical site URL with trailing slash (comment-URL convention). */
  canonicalUrl: string
}

function decodeSegment(segment: string | undefined): string | null {
  if (segment === undefined || segment === '') {
    return null
  }
  try {
    return decodeURIComponent(segment)
  } catch {
    return null
  }
}

async function findLivePostBySlug(db: NodePgDatabase, slug: string): Promise<{ id: bigint; title: string } | null> {
  const rows = await db
    .select({ id: post.id, title: post.title })
    .from(post)
    .where(
      and(
        eq(post.slug, slug),
        liveContentWhere({
          deletedAt: post.deletedAt,
          published: post.published,
          publishedRevisionId: post.publishedRevisionId,
          publishedAt: post.publishedAt,
        }),
      ),
    )
    .limit(1)
  return rows[0] ?? null
}

async function findLivePageBySlug(db: NodePgDatabase, slug: string): Promise<{ id: bigint; title: string } | null> {
  const rows = await db
    .select({ id: page.id, title: page.title })
    .from(page)
    .where(
      and(
        eq(page.slug, slug),
        liveContentWhere({
          deletedAt: page.deletedAt,
          published: page.published,
          publishedRevisionId: page.publishedRevisionId,
          publishedAt: page.publishedAt,
        }),
      ),
    )
    .limit(1)
  return rows[0] ?? null
}

/**
 * Resolve a webmention `target` URL to a live post/page on this site.
 * Returns null when the URL is not on the site origin, does not match
 * the `/posts/<slug>` or `/<slug>` shapes, or the entity is not live
 * (draft / scheduled / trashed / missing). The mention is rejected at
 * the route with 404 in that case.
 */
export async function resolveWebmentionTarget(db: NodePgDatabase, rawTarget: string): Promise<WebmentionTarget | null> {
  const target = tryParseUrl(rawTarget)
  if (target === null || (target.protocol !== 'http:' && target.protocol !== 'https:')) {
    return null
  }
  const site = tryParseUrl(requireBlogSettingsSection('siteIdentity').website)
  if (site === null || target.host !== site.host) {
    return null
  }

  const segments = target.pathname.split('/').filter(Boolean)
  let type: 'post' | 'page'
  let slug: string | null
  if (segments.length === 2 && segments[0] === 'posts') {
    type = 'post'
    slug = decodeSegment(segments[1])
  } else if (segments.length === 1) {
    type = 'page'
    slug = decodeSegment(segments[0])
  } else {
    return null
  }
  if (slug === null) {
    return null
  }

  const entity = type === 'post' ? await findLivePostBySlug(db, slug) : await findLivePageBySlug(db, slug)
  if (entity === null) {
    return null
  }
  return {
    type,
    ownerId: entity.id,
    slug,
    title: entity.title,
    canonicalUrl: `${site.origin}${entityPermalink(type, slug)}/`,
  }
}
