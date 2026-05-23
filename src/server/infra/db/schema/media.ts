import {
  bigint,
  bigserial,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core'

// Image library backing the admin "图片管理" surface.
//
// Every row represents an object uploaded through the admin panel
// into the configured S3-compatible bucket; `storagePath` is the S3
// object key (e.g. `images/2026/05/2026050214321999.jpg`,
// `images/categories/<slug>.jpg`, `images/links/<host>.jpg`) and the
// public URL is `<publicBaseUrl>/<storagePath>` at runtime.
//
// `width` / `height` / `byteSize` are populated from the upload
// pipeline (sharp metadata after the JPEG re-encode); `thumbhash` is
// a base64 string consumed by the runtime placeholder hook.
//
// `storagePath` is `UNIQUE` so the upload service can `ON CONFLICT
// DO UPDATE` on the state-keyed kinds (category / friend) without a
// pre-flight SELECT. The `kind=generic` upload always picks a
// timestamp key so it should not collide in practice; the unique
// constraint catches any pathological case loudly.
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

// Music library backing the admin "音乐管理" surface and the
// `<MusicPlayer />` MDX component.
//
// Every row represents a song whose audio + cover have been
// downloaded from a third-party music provider (currently only
// `netease` via `@meting/core`) into the same S3 bucket the image
// library uses. Audio lives at `musics/<playerId>.mp3`, cover at
// `musics/<playerId>.jpg` (300×300 JPEG re-encoded by `sharp`).
//
// Key shape:
// - `(source, sourceId)` is the business unique key. `source` is a
//   varchar instead of an enum so future providers (tencent, kugou,
//   …) only require an application-layer change. `sourceId` is the
//   provider-side song id.
// - `playerId` is a 16-char `[a-z0-9]` opaque handle generated server-
//   side (collision-retry once). It is what MDX writes:
//   `<MusicPlayer id="7hk2pqrxyzabc012" />` and what the public GET
//   API keys on. Decoupling it from `sourceId` means the public URL
//   does not leak the provider id and a future provider switch will
//   not invalidate the MDX corpus.
// - `audioStoragePath` / `coverStoragePath` are unique S3 keys, so
//   re-importing the same song is a hard constraint violation rather
//   than silent overwrite.
// - `lyric` stores the raw LRC text inline so the public GET API can
//   return audio + cover URL + lyric in a single query.
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
