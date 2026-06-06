import { bigint, bigserial, index, integer, pgTable, text, timestamp, uniqueIndex, varchar } from 'drizzle-orm/pg-core'

export const image = pgTable(
  'image',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .$defaultFn(() => new Date()),
    deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'date' }),
    storagePath: varchar('storage_path', { length: 500 }).unique().notNull(),
    mimeType: varchar('mime_type', { length: 60 }).notNull(),
    width: integer('width').notNull(),
    height: integer('height').notNull(),
    byteSize: bigint('byte_size', { mode: 'number' }).notNull(),
    thumbhash: text('thumbhash'),
    uploaderId: bigint('uploader_id', { mode: 'bigint' }),
    note: text('note'),
  },
  (table) => [index('idx_image_created_at').on(table.createdAt), index('idx_image_deleted_at').on(table.deletedAt)],
)

export const music = pgTable(
  'music',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .$defaultFn(() => new Date()),
    deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'date' }),
    source: varchar('source', { length: 20 }).notNull(),
    sourceId: varchar('source_id', { length: 64 }).notNull(),
    playerId: varchar('player_id', { length: 16 }).unique().notNull(),
    name: varchar('name', { length: 200 }).notNull(),
    artist: varchar('artist', { length: 200 }).notNull(),
    album: varchar('album', { length: 200 }).notNull(),
    audioStoragePath: varchar('audio_storage_path', { length: 500 }).unique().notNull(),
    coverStoragePath: varchar('cover_storage_path', { length: 500 }).unique().notNull(),
    lyric: text('lyric'),
    uploaderId: bigint('uploader_id', { mode: 'bigint' }),
  },
  (table) => [
    uniqueIndex('uq_music_source_source_id').on(table.source, table.sourceId),
    index('idx_music_player_id').on(table.playerId),
    index('idx_music_created_at').on(table.createdAt),
    index('idx_music_deleted_at').on(table.deletedAt),
  ],
)
