import type { Database } from '@/server/infra/db/database'
import type { PortableTextBody } from '@/shared/pt/schema'

import { wirePostPublishHook } from '@/server/domains/posts/publish-hooks'
import { rescheduleWebmentionOutbox } from '@/server/domains/webmentions/outbox-scheduler'
import { normalizeForMatch } from '@/server/domains/webmentions/verify'
import { upsertWebmentionOutbox } from '@/server/infra/db/operations/webmention-outbox'
import { requireBlogSettingsSection } from '@/shared/config/getters'
import { entityCommentUrl } from '@/shared/utils/paths'
import { tryParseUrl } from '@/shared/utils/safe-url'

// Backstop against pathological bodies (admin-written), nothing more.
export const MAX_OUTBOUND_LINKS_PER_POST = 50

/**
 * External http(s) `link` markDef hrefs, deduped, normalized like the
 * receive side, excluding links back to this site.
 */
export function extractExternalLinks(body: PortableTextBody, siteHost: string): string[] {
  const seen = new Set<string>()
  for (const block of body) {
    // The block union carries markDefs on text-bearing variants only.
    const markDefs = 'markDefs' in block ? block.markDefs : undefined
    if (markDefs === undefined) {
      continue
    }
    for (const def of markDefs) {
      if (def._type !== 'link') {
        continue
      }
      // normalizeForMatch returns null for non-http(s) hrefs (mailto:, relative…).
      const normalized = normalizeForMatch(def.href)
      if (normalized === null) {
        continue
      }
      const host = tryParseUrl(normalized)?.host
      if (host === undefined || host === siteHost) {
        continue
      }
      seen.add(normalized)
      if (seen.size >= MAX_OUTBOUND_LINKS_PER_POST) {
        return [...seen]
      }
    }
  }
  return [...seen]
}

/**
 * One outbox row per external link (upsert leaves `sent` alone, resets
 * terminal rows); a future `publishedAt` delays the waterline to publish.
 */
export async function enqueuePostWebmentionOutbox(
  db: Database,
  slug: string,
  body: PortableTextBody,
  publishedAt?: Date | null,
): Promise<number> {
  const siteHost = tryParseUrl(requireBlogSettingsSection('siteIdentity').website)?.host
  if (siteHost === undefined) {
    return 0
  }
  const links = extractExternalLinks(body, siteHost)
  if (links.length === 0) {
    return 0
  }
  const sourceUrl = entityCommentUrl('post', slug)
  const now = new Date()
  const delayUntil = publishedAt !== null && publishedAt !== undefined && publishedAt > now ? publishedAt : null
  for (const targetUrl of links) {
    await upsertWebmentionOutbox(db, { sourceUrl, targetUrl, nextRetryAt: delayUntil })
  }
  rescheduleWebmentionOutbox()
  return links.length
}

/** Composition-root wiring: the outbox enqueue is the post-publish hook
 *  (the seam lives in the posts domain so posts never import webmentions). */
export function wireWebmentionPostPublishHook(): void {
  wirePostPublishHook(async (db, meta, body) => {
    await enqueuePostWebmentionOutbox(db, meta.slug, body, meta.publishedAt)
  })
}
