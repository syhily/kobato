import { eq } from 'drizzle-orm'

import type { EntityTarget, EntityType } from '@/server/infra/db/target'

import { db } from '@/server/infra/db/pool'
import { page } from '@/server/infra/db/schema/page'
import { post } from '@/server/infra/db/schema/post'
import { requireBlogSettingsSection } from '@/shared/config/getters'
import { joinUrl } from '@/shared/utils/urls'

/**
 * Path component of the public URL for an entity. Posts live under
 * `/posts/<slug>`, pages live directly under `/<slug>`.
 */
export function entityPermalink(type: EntityType, slug: string): string {
  return type === 'post' ? `/posts/${slug}` : `/${slug}`
}

/**
 * Fully-qualified URL with trailing slash — the shape comment / metric
 * rows used to store as the URL `page_key`. Used at email-send time so
 * notification permalinks always reflect the current `siteIdentity.website`
 * and the current canonical slug.
 */
export function entityCommentUrl(type: EntityType, slug: string): string {
  const website = requireBlogSettingsSection('siteIdentity').website
  return joinUrl(website, entityPermalink(type, slug), '/')
}

/**
 * Look up the live `(slug, title)` of an entity target. Used by the
 * email senders and the comment-form loader, both of which need the
 * current values rather than the stale denormalised snapshot the
 * metric table used to carry. Returns `null` when the entity has been
 * hard-deleted or the target points at nothing (orphan).
 */
export async function findEntitySlugTitle(target: EntityTarget): Promise<{ slug: string; title: string } | null> {
  if (target.type === 'post') {
    const rows = await db
      .select({ slug: post.slug, title: post.title })
      .from(post)
      .where(eq(post.id, target.ownerId))
      .limit(1)
    return rows[0] ?? null
  }
  const rows = await db
    .select({ slug: page.slug, title: page.title })
    .from(page)
    .where(eq(page.id, target.ownerId))
    .limit(1)
  return rows[0] ?? null
}
