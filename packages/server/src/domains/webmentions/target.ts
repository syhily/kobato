import type { Database } from '@kobato/db/database.ts'

import { entityPermalink } from '@kobato/server/domains/content/urls.ts'
import { findLivePageBySlug } from '@kobato/server/domains/pages/services/public-query.ts'
import { findLivePostBySlug } from '@kobato/server/domains/posts/services/single.ts'
import { DomainError } from '@kobato/server/infra/http/errors.ts'
import { requireBlogSettingsSection } from '@kobato/settings/getters.ts'
import { tryParseUrl } from '@kobato/utils/safe-url.ts'

export interface WebmentionTarget {
  type: 'post' | 'page'
  ownerId: number
  slug: string
  title: string
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

export async function resolveWebmentionTargetOrThrow(db: Database, rawTarget: string): Promise<WebmentionTarget> {
  const target = await resolveWebmentionTarget(db, rawTarget)
  if (target === null) {
    throw new DomainError('NOT_FOUND', 'target is not a resource on this site')
  }
  return target
}
