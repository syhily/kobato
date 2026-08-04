import type { Database } from '@kobato/server/infra/db/database'

import { findLivePageBySlug } from '@kobato/server/domains/pages/services/public-query'
import { findLivePostBySlug } from '@kobato/server/domains/posts/services/single'
import { DomainError } from '@kobato/server/infra/http/errors'
import { requireBlogSettingsSection } from '@kobato/shared/config/getters'
import { entityPermalink } from '@kobato/shared/utils/paths'
import { tryParseUrl } from '@kobato/shared/utils/safe-url'

export interface WebmentionTarget {
  type: 'post' | 'page'
  ownerId: number
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

/**
 * Resolve a webmention `target` URL to a live post/page on this site.
 * Returns null when the URL is not on the site origin, does not match
 * the `/posts/<slug>` or `/<slug>` shapes, or the entity is not live
 * (draft / scheduled / trashed / missing). The mention is rejected at
 * the route with 404 in that case.
 */
export async function resolveWebmentionTarget(db: Database, rawTarget: string): Promise<WebmentionTarget | null> {
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

/**
 * `resolveWebmentionTarget` for the two receive-side paths that both
 * reject an unknown target outright — the endpoint's enqueue (a 404 at
 * the route) and the inbox worker (a terminal drop): a null resolution
 * is always a DomainError there, never a silent skip.
 */
export async function resolveWebmentionTargetOrThrow(db: Database, rawTarget: string): Promise<WebmentionTarget> {
  const target = await resolveWebmentionTarget(db, rawTarget)
  if (target === null) {
    throw new DomainError('NOT_FOUND', 'target is not a resource on this site')
  }
  return target
}
