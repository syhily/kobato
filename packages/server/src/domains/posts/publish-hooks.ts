import type { ErrorMessageDescriptor } from '@kobato/api/contracts/api-error'
import type { Database } from '@kobato/db/database'
import type { PostMetaRow } from '@kobato/db/types'
import type { LexicalEditorState } from '@kobato/inkling/headless/schema'

import { getLogger } from '@kobato/server/infra/logger'

const log = getLogger('posts.publish-hooks')

export const POST_PUBLISH_HOOK_WARNING = {
  messageKey: 'content.warning.publishHookFailed',
  fallbackMessage: 'Post-publish processing (e.g. queueing Webmentions) failed; the post itself is unaffected.',
} as const satisfies ErrorMessageDescriptor

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
