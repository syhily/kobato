import type { Database } from '@/server/infra/db/database'
import type { PostMetaRow } from '@/server/infra/db/types'
import type { ErrorMessageDescriptor } from '@/shared/contracts/api-error'
import type { LexicalEditorState } from '@/shared/lexical/schema'

import { getLogger } from '@/server/infra/logger'

const log = getLogger('posts.publish-hooks')

export const POST_PUBLISH_HOOK_WARNING = {
  messageKey: 'content.warning.publishHookFailed',
  fallbackMessage: 'Post-publish processing (e.g. queueing Webmentions) failed; the post itself is unaffected.',
} as const satisfies ErrorMessageDescriptor

/**
 * Post-publish extension seam: the owning domain wires the hook at import
 * time (unwired = no-op). Posts must never import webmentions back (DAG).
 */
export type PostPublishHook = (
  db: Database,
  meta: PostMetaRow,
  body: LexicalEditorState,
  warnings: ErrorMessageDescriptor[],
) => Promise<void>

let impl: PostPublishHook | null = null

export function wirePostPublishHook(hook: PostPublishHook): void {
  impl = hook
}

/** Run the wired extension (if any); a throwing hook degrades to a
 *  publish warning, never a failed publish. */
export async function runPostPublishHooks(
  db: Database,
  meta: PostMetaRow,
  body: LexicalEditorState,
  warnings: ErrorMessageDescriptor[],
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
