import type { Database } from '@/server/infra/db/database'

import { findLivePageBySlug } from '@/server/domains/pages/services/public-query'
import { findLivePostBySlug } from '@/server/domains/posts/services/single'
import { DomainError } from '@/server/infra/http/errors'
import { requireBlogSettingsSection } from '@/shared/config/getters'
import { entityPermalink } from '@/shared/utils/paths'
import { tryParseUrl } from '@/shared/utils/safe-url'

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

/** Resolve a webmention `target` URL to a live post/page, else null
 *  (the receive route answers 404). */
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

/** `resolveWebmentionTarget` as an error — null is never a silent skip here. */
export async function resolveWebmentionTargetOrThrow(db: Database, rawTarget: string): Promise<WebmentionTarget> {
  const target = await resolveWebmentionTarget(db, rawTarget)
  if (target === null) {
    throw new DomainError('NOT_FOUND', 'target is not a resource on this site')
  }
  return target
}
