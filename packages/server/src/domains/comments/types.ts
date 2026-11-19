import type { CommentEditorState } from '@kobato/inkling/headless/comment-schema.ts'

export interface CommentAndUser {
  id: number
  createAt: Date
  updatedAt: Date
  deleteAt: Date | null
  deleteRequestedAt?: Date | string | null
  body: CommentEditorState
  content: string | null
  type: 'post' | 'page' | null
  ownerId: number | null
  userId: number
  isVerified: boolean | null
  ua: string | null
  ip: string | null
  rid: number
  isCollapsed: boolean | null
  isPending: boolean | null
  isPinned: boolean | null
  voteUp: number | null
  voteDown: number | null
  rootId: number | null
  name: string
  email: string
  emailVerified: boolean
  link: string | null
  badgeName: string | null
  badgeColor: string | null
  badgeTextColor: string | null
}

export interface CommentItem extends CommentAndUser {
  children?: CommentItem[]
  childrenTruncated?: boolean
  childrenTotal?: number
}

export interface Comments {
  comments: CommentAndUser[]
  count: number
  roots_count: number
}

export interface AdminComment extends CommentAndUser {
  pageTitle: string | null
  pagePublicId: string | null
  pageCover: string | null
  pagePermalink: string | null
}

export interface AdminCommentsResult {
  comments: AdminComment[]
  total: number
  hasMore: boolean
  statusCounts: { all: number; pending: number; approved: number; deleteRequested: number }
}
