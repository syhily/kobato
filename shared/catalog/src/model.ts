import type { LexicalEditorState } from '@kobato/inkling/headless/schema'
import type { MarkdownHeading } from '@kobato/inkling/headless/toc'

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
  updated?: Date
  comments: boolean
  cover: string
  coverThumbhash?: string
  coverWidth?: number
  coverHeight?: number
  og?: string
  published: boolean
  summary: string
  toc: boolean
  showUpdated: boolean
  contentLanguage: string | null
  showFriends: boolean
  slug: string
  permalink: string
  headings: MarkdownHeading[]
}

export interface ClientPost {
  id: string
  title: string
  date: Date
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
  showUpdated: boolean
  contentLanguage: string | null
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
  id: string
  slug: string
  title: string
  summary: string
  cover: string
  coverThumbhash?: string
  permalink: string
  category: string
  date: Date
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
  updated?: Date
  og?: string
  comments: boolean
  toc: boolean
  showUpdated: boolean
  contentLanguage: string | null
  headings: MarkdownHeading[]
}

export interface DetailPageShell {
  id: string
  slug: string
  title: string
  summary: string
  cover: string
  coverThumbhash?: string
  coverWidth?: number
  coverHeight?: number
  permalink: string
  date: Date
  updated?: Date
  og?: string
  comments: boolean
  toc: boolean
  showUpdated: boolean
  contentLanguage: string | null
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

export interface Post extends ClientPost {
  bodyHtml: string | null
  bodyHtmlFeed: string | null
  bodyState: LexicalEditorState | null
  imageSources: string[]
  publishedRevisionId: number | null
}

export interface Page extends ClientPage {
  bodyHtml: string | null
  bodyHtmlFeed: string | null
  bodyState: LexicalEditorState | null
  imageSources: string[]
  publishedRevisionId: number | null
}
