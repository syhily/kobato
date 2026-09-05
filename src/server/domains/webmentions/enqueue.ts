import type { Database } from '@/server/infra/db/database'
import type { LexicalEditorState } from '@/shared/lexical/schema'

import { wirePostPublishHook } from '@/server/domains/posts/publish-hooks'
import { rescheduleWebmentionOutbox } from '@/server/domains/webmentions/outbox-scheduler'
import { normalizeForMatch } from '@/server/domains/webmentions/verify'
import { upsertWebmentionOutbox } from '@/server/infra/db/operations/webmention-outbox'
import { requireBlogSettingsSection } from '@/shared/config/getters'
import { visitLexicalNodes } from '@/shared/lexical/walk'
import { entityCommentUrl } from '@/shared/utils/paths'
import { tryParseUrl } from '@/shared/utils/safe-url'
import { unsafeCast } from '@/shared/utils/unsafe-cast'

// Backstop against pathological bodies (admin-written), nothing more.
export const MAX_OUTBOUND_LINKS_PER_POST = 50

/**
 * External http(s) link/autolink node URLs, deduped, normalized like the
 * receive side, excluding links back to this site. Both node types count:
 * an autolink is a real outbound `<a>` in the rendered page (the webmention
 * source document), so it deserves the same discovery as an explicit link.
 */
export function extractExternalLinks(body: LexicalEditorState, siteHost: string): string[] {
  const seen = new Set<string>()
  visitLexicalNodes(body, (node) => {
    if (node.type !== 'link' && node.type !== 'autolink') {
      return
    }
    if (seen.size >= MAX_OUTBOUND_LINKS_PER_POST) {
      return
    }
    // `url` is a per-variant field the shared node type does not model; the
    // schema pins it as a string on link/autolink nodes.
    const url = unsafeCast<{ url?: unknown }>(node).url
    if (typeof url !== 'string') {
      return
    }
    // normalizeForMatch returns null for non-http(s) hrefs (mailto:, relative…).
    const normalized = normalizeForMatch(url)
    if (normalized === null) {
      return
    }
    const host = tryParseUrl(normalized)?.host
    if (host === undefined || host === siteHost) {
      return
    }
    seen.add(normalized)
  })
  return [...seen]
}

/**
 * One outbox row per external link (upsert leaves `sent` alone, resets
 * terminal rows); a future `publishedAt` delays the waterline to publish.
 */
export async function enqueuePostWebmentionOutbox(
  db: Database,
  slug: string,
  body: LexicalEditorState,
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
