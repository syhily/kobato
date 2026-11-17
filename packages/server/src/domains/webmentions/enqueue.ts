import type { LexicalEditorState } from '@kobato/shared/lexical/schema.ts'

import { requireBlogSettingsSection } from '@kobato/shared/config/getters.ts'
import { visitLexicalNodes } from '@kobato/shared/lexical/walk.ts'
import { entityCommentUrl } from '@kobato/shared/utils/paths.ts'
import { tryParseUrl } from '@kobato/shared/utils/safe-url.ts'
import { unsafeCast } from '@kobato/shared/utils/unsafe-cast.ts'

import type { Database } from '../../infra/db/database'

import { upsertWebmentionOutbox } from '../../infra/db/operations/webmention-outbox'
import { wirePostPublishHook } from '../posts/publish-hooks'
import { rescheduleWebmentionOutbox } from './outbox-scheduler'
import { normalizeForMatch } from './verify'

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
