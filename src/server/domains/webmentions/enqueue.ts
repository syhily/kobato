import type { Database } from '@/server/infra/db/database'
import type { PortableTextBody } from '@/shared/pt/schema'

import { wirePostPublishHook } from '@/server/domains/posts/publish-hooks'
import { rescheduleWebmentionOutbox } from '@/server/domains/webmentions/outbox-scheduler'
import { normalizeForMatch } from '@/server/domains/webmentions/verify'
import { upsertWebmentionOutbox } from '@/server/infra/db/operations/webmention-outbox'
import { requireBlogSettingsSection } from '@/shared/config/getters'
import { entityCommentUrl } from '@/shared/utils/paths'
import { tryParseUrl } from '@/shared/utils/safe-url'

// Backstop against pathological bodies, nothing more: the post body is
// written by the site admin, so this only bounds a paste gone wrong.
export const MAX_OUTBOUND_LINKS_PER_POST = 50

/**
 * External http(s) links in a post body — every `link` markDef href,
 * normalized the same way the receive side compares URLs (fragment,
 * default port, trailing slash stripped), deduped, excluding links back
 * to this site (self-mentions are meaningless). Pure and capped.
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
      // normalizeForMatch already rejects non-http(s) hrefs (mailto:,
      // relative anchors, …) by returning null for them.
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
 * Enqueue one outbox row per external link in the freshly published body.
 * The upsert dedups on (source, target): already-`sent` rows are left
 * alone, `no-endpoint` / `failed` rows reset for another try, new links
 * land as fresh `pending` rows.
 *
 * A scheduled post (`publishedAt` in the future — the publish hook fires
 * when the revision is promoted, ahead of the public moment) has its
 * waterline pushed to the publish instant: the source page must actually
 * answer 200 when the endpoint verifies it. Returns the enqueued count.
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

/**
 * Composition-root wiring (called from `bootstrap/db-lifecycle`): register
 * the outbox enqueue as THE post-publish hook — the seam lives in the
 * posts domain (`posts/publish-hooks.ts`) because the DAG keeps posts from
 * importing webmentions back.
 */
export function wireWebmentionPostPublishHook(): void {
  wirePostPublishHook(async (db, meta, body) => {
    await enqueuePostWebmentionOutbox(db, meta.slug, body, meta.publishedAt)
  })
}
