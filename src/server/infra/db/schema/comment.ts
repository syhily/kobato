import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

import type { CommentEditorState } from '@/shared/lexical/comment-schema'

import { EMPTY_COMMENT_EDITOR_STATE } from '@/shared/lexical/comment-schema'

export const comment = sqliteTable(
  'comment',
  {
    id: integer('id').primaryKey({ autoIncrement: true }).notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
    deletedAt: integer('deleted_at', { mode: 'timestamp_ms' }),
    content: text('content').default(''),
    body: text('body', { mode: 'json' })
      .$type<CommentEditorState>()
      .notNull()
      .$defaultFn(() => EMPTY_COMMENT_EDITOR_STATE),
    type: text('type').$type<'post' | 'page'>().notNull(),
    ownerId: integer('owner_id').notNull(),
    userId: integer('user_id').notNull(),
    isVerified: integer('is_verified', { mode: 'boolean' }).default(false),
    ua: text('ua'),
    ip: text('ip'),
    rid: integer('rid').notNull().default(0),
    isCollapsed: integer('is_collapsed', { mode: 'boolean' }).default(false),
    isPending: integer('is_pending', { mode: 'boolean' }).default(false),
    isPinned: integer('is_pinned', { mode: 'boolean' }).default(false),
    contentHash: text('content_hash'),
    voteUp: integer('vote_up').notNull().default(0),
    voteDown: integer('vote_down').notNull().default(0),
    rootId: integer('root_id'),
    deleteRequestedAt: integer('delete_requested_at', { mode: 'timestamp_ms' }),
    deleteRequestedBy: integer('delete_requested_by'),
  },
  (table) => [
    index('idx_comment_root_id').on(table.rootId),
    index('idx_comment_rid').on(table.rid),
    index('idx_comment_user_id').on(table.userId),
    index('idx_comment_owner').on(table.type, table.ownerId),
    index('idx_comment_deleted_at').on(table.deletedAt),
    index('idx_comment_delete_requested_at').on(table.deleteRequestedAt),
    index('idx_comment_thread').on(table.type, table.ownerId, table.rootId),
    index('idx_comment_content_hash').on(table.contentHash),
  ],
)
