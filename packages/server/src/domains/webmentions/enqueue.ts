import type { Database } from '@kobato/db/sqlite/database'
import type { LexicalEditorState } from '@kobato/inkling/headless/schema'

import { upsertWebmentionOutbox } from '@kobato/db/sqlite/operations/engagement/webmention-outbox'
import { visitLexicalNodes } from '@kobato/inkling/headless/walk'
import { entityCommentUrl } from '@kobato/server/domains/content/urls'
import { wirePostPublishHook } from '@kobato/server/domains/posts/publish-hooks'
import { rescheduleWebmentionOutbox } from '@kobato/server/domains/webmentions/outbox-scheduler'
import { normalizeForMatch } from '@kobato/server/domains/webmentions/verify'
import { requireBlogSettingsSection } from '@kobato/settings/getters'
import { tryParseUrl } from '@kobato/utils/safe-url'
import { unsafeCast } from '@kobato/utils/unsafe-cast'

export const MAX_OUTBOUND_LINKS_PER_POST = 50

export function extractExternalLinks(body: LexicalEditorState, siteHost: string): string[] {
  const seen = new Set<string>()
  visitLexicalNodes(body, (node) => {
    if (node.type !== 'link' && node.type !== 'autolink') {
      return
    }
    if (seen.size >= MAX_OUTBOUND_LINKS_PER_POST) {
      return
    }
    const url = unsafeCast<{ url?: unknown }>(node).url
    if (typeof url !== 'string') {
      return
    }
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

export function wireWebmentionPostPublishHook(): void {
  wirePostPublishHook(async (db, meta, body) => {
    await enqueuePostWebmentionOutbox(db, meta.slug, body, meta.publishedAt)
  })
}
