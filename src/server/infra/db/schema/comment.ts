import { sql } from 'drizzle-orm'
import { bigint, bigserial, boolean, index, jsonb, pgTable, text, timestamp, varchar } from 'drizzle-orm/pg-core'

import type { CommentBody } from '@/shared/pt/comment-schema'

export const comment = pgTable(
  'comment',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .$defaultFn(() => new Date()),
    deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'date' }),
    content: text('content').default(''),
    body: jsonb('body')
      .$type<CommentBody>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    type: varchar('type', { length: 16 }).$type<'post' | 'page'>().notNull(),
    ownerId: bigint('owner_id', { mode: 'bigint' }).notNull(),
    userId: bigint('user_id', { mode: 'bigint' }).notNull(),
    isVerified: boolean('is_verified').default(false),
    ua: text('ua'),
    ip: text('ip'),
    rid: bigint('rid', { mode: 'number' }).notNull().default(0),
    isCollapsed: boolean('is_collapsed').default(false),
    isPending: boolean('is_pending').default(false),
    isPinned: boolean('is_pinned').default(false),
    voteUp: bigint('vote_up', { mode: 'number' }),
    voteDown: bigint('vote_down', { mode: 'number' }),
    rootId: bigint('root_id', { mode: 'bigint' }),
    deleteRequestedAt: timestamp('delete_requested_at', { withTimezone: true, mode: 'date' }),
    deleteRequestedBy: bigint('delete_requested_by', { mode: 'bigint' }),
  },
  (table) => [
    index('idx_comment_root_id').on(table.rootId),
    index('idx_comment_rid').on(table.rid),
    index('idx_comment_user_id').on(table.userId),
    index('idx_comment_owner').on(table.type, table.ownerId),
    index('idx_comment_deleted_at').on(table.deletedAt),
    index('idx_comment_delete_requested_at').on(table.deleteRequestedAt),
  ],
)
