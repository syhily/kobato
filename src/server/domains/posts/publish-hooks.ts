import type { Database } from '@/server/infra/db/database'
import type { PostMetaRow } from '@/server/infra/db/types'
import type { PortableTextBody } from '@/shared/pt/schema'

import { getLogger } from '@/server/infra/logger'

const log = getLogger('posts.publish-hooks')

export const POST_PUBLISH_HOOK_WARNING = '发布后的扩展处理（如 Webmention 发送入队）失败，不影响文章本身。'

/**
 * Post-publish extension seam: the owning domain wires the hook at import
 * time (unwired = no-op). Posts must never import webmentions back (DAG).
 */
export type PostPublishHook = (
  db: Database,
  meta: PostMetaRow,
  body: PortableTextBody,
  warnings: string[],
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
  body: PortableTextBody,
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
