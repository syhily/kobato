import type { Database } from '@kobato/server/infra/db/database'
import type { LexicalBody } from '@kobato/shared/lexical/schema'

import { wirePostPublishHook } from '@kobato/server/domains/posts/publish-hooks'
import { rescheduleWebmentionOutbox } from '@kobato/server/domains/webmentions/outbox-scheduler'
import { normalizeForMatch } from '@kobato/server/domains/webmentions/verify'
import { upsertWebmentionOutbox } from '@kobato/server/infra/db/operations/webmention-outbox'
import { requireBlogSettingsSection } from '@kobato/shared/config/getters'
import { visitLexicalNodes } from '@kobato/shared/lexical/walk'
import { entityCommentUrl } from '@kobato/shared/utils/paths'
import { tryParseUrl } from '@kobato/shared/utils/safe-url'

// Backstop against pathological bodies, nothing more: the post body is
// written by the site admin, so this only bounds a paste gone wrong.
export const MAX_OUTBOUND_LINKS_PER_POST = 50

/**
 * External http(s) links in a post body — every `link` markDef href,
 * normalized the same way the receive side compares URLs (fragment,
 * default port, trailing slash stripped), deduped, excluding links back
 * to this site (self-mentions are meaningless). Pure and capped.
 */
export function extractExternalLinks(body: LexicalBody, siteHost: string): string[] {
  const seen = new Set<string>()
  const urls: string[] = []
  visitLexicalNodes(body, (node) => {
    if (node.type === 'link') {
      urls.push(node.url)
    }
  })
  for (const url of urls) {
    // normalizeForMatch already rejects non-http(s) hrefs (mailto:,
    // relative anchors, …) by returning null for them.
    const normalized = normalizeForMatch(url)
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
  body: LexicalBody,
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
