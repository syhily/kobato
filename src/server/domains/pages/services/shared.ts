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
