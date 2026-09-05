import type { MarkdownHeading } from '@/shared/utils/toc'

export type DraftMarker = 'draft' | 'unpublished-draft' | 'published-draft' | null

export interface Friend {
  website: string
  description?: string
  homepage: string
  poster: string
  posterThumbhash?: string
}

export interface Category {
  name: string
  slug: string
  cover: string
  coverThumbhash?: string
  description: string
  counts: number
  permalink: string
}

export interface Tag {
  name: string
  slug: string
  counts: number
  permalink: string
}

export interface ClientPage {
  id: string
  title: string
  date: Date
  /** When present from catalog hydration: `published_at` (last publish / go-live), not `updated_at`. */
  updated?: Date
  comments: boolean
  cover: string
  coverThumbhash?: string
  /** Intrinsic cover dimensions resolved from the `image` row at catalog hydration. */
  coverWidth?: number
  coverHeight?: number
  og?: string
  published: boolean
  summary: string
  toc: boolean
  /** When true the public detail route renders the 「修改于 XXXX」 timestamp next to the first-publish date; flipped from the editor without re-publishing. */
  showUpdated: boolean
  /** When true the public detail route appends the global friends grid below the body (the body format has no friends block). */
  showFriends: boolean
  slug: string
  permalink: string
  headings: MarkdownHeading[]
}

export interface ClientPost {
  id: string
  title: string
  date: Date
  /** When present from catalog hydration: `published_at` (last publish / go-live), not `updated_at`. */
  updated?: Date
  comments: boolean
  alias: string[]
  tags: string[]
  category: string
  summary: string
  cover: string
  coverThumbhash?: string
  og?: string
  published: boolean
  visible: boolean
  toc: boolean
  /** See `ClientPage.showUpdated`. Toggles "Updated on XXXX" on the public detail. */
  showUpdated: boolean
  slug: string
  permalink: string
  headings: MarkdownHeading[]
  pinnedAt?: Date
}

export type ClientCategory = Category
export type ClientTag = Tag

export interface PostMetadata {
  likes: number
  views: number
  comments: number
}

export type ClientPostWithMetadata = ClientPost & { meta: PostMetadata }

export interface PostVisibilityOptions {
  includeHidden: boolean
  includeScheduled: boolean
}

export interface LoadPostsWithMetadataOptions {
  likes: boolean
  views: boolean
  comments: boolean
}

export interface ListingPostCard {
  /** Stringified `post.id` — used by the metric-metadata fan-out helper to key
   * counter rows by `(type='post', owner_id=BigInt(id))`. */
  id: string
  slug: string
  title: string
  summary: string
  cover: string
  coverThumbhash?: string
  permalink: string
  category: string
  date: Date
  /** Drafts get a "[Draft]" prefix in the listing title. */
  published: boolean
}

export type ListingPostCardWithMetadata = ListingPostCard & { meta: PostMetadata }

export interface DetailPostShell {
  id: string
  slug: string
  title: string
  summary: string
  cover: string
  coverThumbhash?: string
  permalink: string
  category: string
  tags: string[]
  date: Date
  /** Catalog: `published_at` for "last modified", not row `updated_at`. */
  updated?: Date
  og?: string
  comments: boolean
  toc: boolean
  /** See `ClientPost.showUpdated`. */
  showUpdated: boolean
  headings: MarkdownHeading[]
}

export interface DetailPageShell {
  id: string
  slug: string
  title: string
  summary: string
  cover: string
  coverThumbhash?: string
  /** Intrinsic cover dimensions resolved from the `image` row at catalog hydration. */
  coverWidth?: number
  coverHeight?: number
  permalink: string
  date: Date
  /** Catalog: `published_at` for "last modified", not row `updated_at`. */
  updated?: Date
  og?: string
  comments: boolean
  toc: boolean
  /** See `ClientPage.showUpdated`. */
  showUpdated: boolean
  headings: MarkdownHeading[]
}

export interface SidebarPostLink {
  slug: string
  title: string
  permalink: string
}

export interface SidebarTagLink {
  name: string
  slug: string
  permalink: string
  counts: number
}

export interface CommentFormUser {
  id: string
  name: string
  email: string
  website: string | null
  admin: boolean
}

// Types that need the Lexical projection columns (isomorphic)
import type { LexicalEditorState } from '@/shared/lexical/schema'

export interface Post extends ClientPost {
  /** Saved full-fidelity projection column; NULL for pre-R9b rows until the R15 backfill. */
  bodyHtml: string | null
  /** Saved feed-variant projection column (rssMode parity); NULL alongside `bodyHtml`. */
  bodyHtmlFeed: string | null
  /** Parsed Lexical state, populated only when a projection column is NULL (compute-on-read fallback). */
  bodyState: LexicalEditorState | null
  imageSources: string[]
  publishedRevisionId: number | null
}

export interface Page extends ClientPage {
  /** Saved full-fidelity projection column; NULL for pre-R9b rows until the R15 backfill. */
  bodyHtml: string | null
  /** Saved feed-variant projection column (rssMode parity); NULL alongside `bodyHtml`. */
  bodyHtmlFeed: string | null
  /** Parsed Lexical state, populated only when a projection column is NULL (compute-on-read fallback). */
  bodyState: LexicalEditorState | null
  imageSources: string[]
  publishedRevisionId: number | null
}

export function toClientPost(post: Post): ClientPost {
  const {
    bodyHtml: _bodyHtml,
    bodyHtmlFeed: _bodyHtmlFeed,
    bodyState: _bodyState,
    imageSources: _imageSources,
    publishedRevisionId: _rev,
    ...rest
  } = post
  return rest
}

export function toListingPostCard(post: ClientPost): ListingPostCard {
  return {
    id: post.id,
    slug: post.slug,
    title: post.title,
    summary: post.summary,
    cover: post.cover,
    coverThumbhash: post.coverThumbhash,
    permalink: post.permalink,
    category: post.category,
    date: post.date,
    published: post.published,
  }
}

export function toDetailPostShell(post: ClientPost): DetailPostShell {
  return {
    id: post.id,
    slug: post.slug,
    title: post.title,
    summary: post.summary,
    cover: post.cover,
    coverThumbhash: post.coverThumbhash,
    permalink: post.permalink,
    category: post.category,
    tags: post.tags,
    date: post.date,
    updated: post.updated,
    og: post.og,
    comments: post.comments,
    toc: post.toc,
    showUpdated: post.showUpdated,
    headings: post.headings,
  }
}

export function toDetailPageShell(page: ClientPage): DetailPageShell {
  return {
    id: page.id,
    slug: page.slug,
    title: page.title,
    summary: page.summary,
    cover: page.cover,
    coverThumbhash: page.coverThumbhash,
    coverWidth: page.coverWidth,
    coverHeight: page.coverHeight,
    permalink: page.permalink,
    date: page.date,
    updated: page.updated,
    og: page.og,
    comments: page.comments,
    toc: page.toc,
    showUpdated: page.showUpdated,
    headings: page.headings,
  }
}

export function toSidebarPostLink(post: ClientPost): SidebarPostLink {
  return { slug: post.slug, title: post.title, permalink: post.permalink }
}
