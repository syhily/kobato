import { sql } from 'drizzle-orm'
import { check, index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

export const image = sqliteTable(
  'image',
  {
    id: integer('id').primaryKey({ autoIncrement: true }).notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
    deletedAt: integer('deleted_at', { mode: 'timestamp_ms' }),
    storagePath: text('storage_path').unique().notNull(),
    storageDriver: text('storage_driver').$type<'s3' | 'local'>().notNull().default('s3'),
    mimeType: text('mime_type').notNull(),
    width: integer('width').notNull(),
    height: integer('height').notNull(),
    byteSize: integer('byte_size').notNull(),
    thumbhash: text('thumbhash'),
    uploaderId: integer('uploader_id'),
    note: text('note'),
  },
  (table) => [
    index('idx_image_created_at').on(table.createdAt),
    index('idx_image_deleted_at').on(table.deletedAt),
    check('image_storage_driver_chk', sql`${table.storageDriver} IN ('s3', 'local')`),
  ],
)

export const music = sqliteTable(
  'music',
  {
    id: integer('id').primaryKey({ autoIncrement: true }).notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
    deletedAt: integer('deleted_at', { mode: 'timestamp_ms' }),
    source: text('source').notNull(),
    sourceId: text('source_id').notNull(),
    playerId: text('player_id').unique().notNull(),
    name: text('name').notNull(),
    artist: text('artist').notNull(),
    album: text('album').notNull(),
    audioStoragePath: text('audio_storage_path').unique().notNull(),
    coverStoragePath: text('cover_storage_path').unique().notNull(),
    storageDriver: text('storage_driver').$type<'s3' | 'local'>().notNull().default('s3'),
    lyric: text('lyric'),
    uploaderId: integer('uploader_id'),
  },
  (table) => [
    uniqueIndex('uq_music_source_source_id').on(table.source, table.sourceId),
    // No `idx_music_player_id`: the player_id UNIQUE constraint creates
    // an implicit index — and a redundant non-unique index here makes
    // drizzle-kit DROP the constraint from the generated DDL.
    index('idx_music_created_at').on(table.createdAt),
    index('idx_music_deleted_at').on(table.deletedAt),
    check('music_storage_driver_chk', sql`${table.storageDriver} IN ('s3', 'local')`),
  ],
)
