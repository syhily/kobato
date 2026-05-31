// Wire-format DTOs for the tag-management endpoints. Lives in
// `@/shared` so both the server (admin actions) and the client
// (admin UI fetcher) can import the same shape without crossing the
// server/client boundary. Bigints are stringified — the public site
// never ships `id` to the browser, but the admin shell uses it as
// the React list key.

export interface AdminTagDto {
  id: string
  name: string
  slug: string
  ogImage: string
  /**
   * Number of MDX posts (visible + hidden + scheduled) whose
   * `frontmatter.tags[]` includes this row's `name`. Mirrors the
   * delete-block guard's view of references — i.e. if `postCount > 0`,
   * deletion via the admin will be rejected with 409. Computed by the
   * service from `ContentCatalog.postsByTag`; not persisted in the
   * database.
   */
  postCount: number
  createdAt: string
  updatedAt: string
}

// `offset` / `limit` mirror the comment moderation listing
// (`LoadAllCommentsInput`): the admin table is paginated server-side
// because the tag table has hundreds of rows and shipping all of them
// every time `?q=` changes both bloats the response and stalls the
// table render. Both are optional — omitted requests fall back to
// `offset=0, limit=20` (the default page size on the client).
export interface ListTagsInput {
  q?: string
  offset?: number
  limit?: number
}

export interface ListTagsOutput {
  tags: AdminTagDto[]
  /** Total number of tags matching `q` (independent of `offset`/`limit`). */
  total: number
  /** True when `offset + limit < total`. Lets the client skip its own arithmetic. */
  hasMore: boolean
}

// `id` absent → create a new row. Present → update the matching row.
// `slug` is optional on input; the server derives it from `name`
// via `pinyin-pro` when blank, mirroring the historical compile-time
// helper in `source.config.ts`.
export interface UpsertTagInput {
  id?: string
  name: string
  slug?: string
  ogImage?: string
}

export interface UpsertTagOutput {
  tag: AdminTagDto
}

export interface DeleteTagInput {
  id: string
}

export interface DeleteTagOutput {
  success: true
}
