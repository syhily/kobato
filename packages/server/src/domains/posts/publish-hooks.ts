import type { Database } from '@kobato/server/infra/db/database'
import type { PostMetaRow } from '@kobato/server/infra/db/types'
import type { LexicalBody } from '@kobato/shared/lexical/schema'

import { getLogger } from '@kobato/server/infra/logger'

const log = getLogger('posts.publish-hooks')

export const POST_PUBLISH_HOOK_WARNING = '发布后的扩展处理（如 Webmention 发送入队）失败，不影响文章本身。'

/**
 * The post-publish extension SEAM. The posts domain owns the WHEN (the
 * descriptor's `afterPublish`, after the search index) but other domains
 * own pieces of the WHAT (the Webmention outbox enqueues outbound links)
 * — and the cross-domain import graph is a DAG with `webmentions → posts`
 * already taken by the receiver's target resolution, so posts must never
 * import webmentions back. The hook implementation is wired at import
 * time by the owning domain (`webmentions/enqueue`), knocked on below.
 * Unwired = no-op: a publish path that never loaded the webmentions stack
 * simply skips the extension. A second consumer should promote this to an
 * array of hooks rather than fight over the slot.
 */
export type PostPublishHook = (db: Database, meta: PostMetaRow, body: LexicalBody, warnings: string[]) => Promise<void>

let impl: PostPublishHook | null = null

export function wirePostPublishHook(hook: PostPublishHook): void {
  impl = hook
}

/** Run the wired extension (if any); a throwing hook degrades to a
 *  publish warning, never a failed publish — same contract as the
 *  descriptor's own `indexPost` handling. */
export async function runPostPublishHooks(
  db: Database,
  meta: PostMetaRow,
  body: LexicalBody,
  warnings: string[],
): Promise<void> {
  if (impl === null) {
    return
  }
  try {
    await impl(db, meta, body, warnings)
  } catch (err: unknown) {
    log.warn('post publish hook failed', { postId: meta.id, error: err })
    warnings.push(POST_PUBLISH_HOOK_WARNING)
  }
}
