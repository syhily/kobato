import type { SaveDraftResult, PublishLatestResult } from '@/server/domains/content/schema'
import type { AdminRevisionDto } from '@/shared/types/revision'

import { toAdminRevisionDto } from '@/server/domains/pages/projection'

export interface UpsertPageMetaInput {
  /** Existing page id; omitted on create. */
  id?: bigint
  /**
   * Explicit URL slug. Optional — when omitted (or empty), the
   * service derives one from `title` via `deriveSlug` (the canonical
   * pinyin -> github-slugger pipeline). Authors only set this when
   * they want a custom URL like `about-us` for a Han-titled page.
   */
  slug?: string
  title: string
  summary?: string
  cover?: string
  og?: string | null
  published?: boolean
  commentsEnabled?: boolean
  showToc?: boolean
  showUpdated?: boolean
  showFriends?: boolean
  publishedAt?: Date
}

export interface SavePageBodyInput {
  pageId: bigint
  body: unknown
  /** When provided, must match the latest revision's token. */
  expectedClientRevisionToken?: string | null
  /** When true, ignore token mismatch and overwrite. */
  force?: boolean
  /** Author user id stamped on the saved revision. */
  authorId: bigint | null
  /**
   * Publish target (only honoured by `publishLatest`). Omit for
   * "publish immediately" (server uses `now()`); pass a future
   * `Date` to schedule. The catalog hides scheduled pages until
   * `publishedAt <= now()`.
   */
  publishedAt?: Date
}

export type SavePageResult =
  | { status: 'saved'; revision: AdminRevisionDto; warning?: string }
  | {
      status: 'conflict'
      latest: AdminRevisionDto
      /** Token the editor must echo on the next attempt. */
      expectedToken: string
      warning?: string
    }

export function projectSaveResult(result: SaveDraftResult | PublishLatestResult, warning?: string): SavePageResult {
  if (result.status === 'conflict') {
    return {
      status: 'conflict',
      latest: toAdminRevisionDto(result.latest),
      expectedToken: result.expectedToken,
      warning,
    }
  }
  return { status: 'saved', revision: toAdminRevisionDto(result.row), warning }
}
