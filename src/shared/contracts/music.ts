import { z } from 'zod'

import { idString, isoDateTime } from '@/shared/contracts/primitives'

const metingSource = z.enum(['netease', 'tencent'])
export type MetingSource = z.infer<typeof metingSource>

const adminMusicDto = z.object({
  id: idString,
  source: metingSource,
  sourceId: z.string(),
  // Opaque 16-char `[a-z0-9]` handle. Referenced by `musicPlayer` PortableText blocks as `playerId`.
  playerId: z.string(),
  name: z.string(),
  artist: z.array(z.string()),
  album: z.string(),
  audioStoragePath: z.string(),
  audioUrl: z.string(),
  coverStoragePath: z.string(),
  coverUrl: z.string(),
  // LRC text. `null` when the upstream provider had no lyric.
  lyric: z.string().nullable(),
  uploaderId: idString.nullable(),
  uploaderName: z.string().nullable(),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
})
export type AdminMusicDto = z.infer<typeof adminMusicDto>

const metingSearchHitDto = z.object({
  source: metingSource,
  /** Provider-side song id, stringified for transport stability. */
  sourceId: z.string(),
  name: z.string(),
  artist: z.array(z.string()),
  album: z.string(),
  /** Pre-resolved cover URL for the search result thumbnail. */
  coverUrl: z.string(),
  // Direct streaming URL returned by the upstream provider. These URLs
  // are short-lived (token-signed, ~1h on netease) and intentionally
  // NOT persisted — they exist only so the dialog's `<audio>` element
  // can preview the song before it gets imported.
  previewUrl: z.string(),
})
export type MetingSearchHit = z.infer<typeof metingSearchHitDto>

// Public GET payload — what the music `get` procedure returns to the
// browser-side `<MusicPlayer />` so APlayer can render.
export const publicMusicMetaDto = z.object({
  id: z.string(),
  name: z.string(),
  artist: z.string(),
  album: z.string(),
  url: z.string(),
  pic: z.string(),
  lyric: z.string(),
})
export type PublicMusicMeta = z.infer<typeof publicMusicMetaDto>

export const listMusicOutputDto = z.object({
  musics: z.array(adminMusicDto),
  total: z.number().int().nonnegative(),
  hasMore: z.boolean(),
})
export type ListMusicOutput = z.infer<typeof listMusicOutputDto>

export const searchMusicOutputDto = z.object({
  results: z.array(metingSearchHitDto),
  hasMore: z.boolean(),
})
export type SearchMusicOutput = z.infer<typeof searchMusicOutputDto>

export const addMusicOutputDto = z.object({
  music: adminMusicDto,
})
export type AddMusicOutput = z.infer<typeof addMusicOutputDto>

export const updateMusicOutputDto = z.object({
  music: adminMusicDto,
})
export type UpdateMusicOutput = z.infer<typeof updateMusicOutputDto>

export const getMusicOutputDto = z.object({
  music: adminMusicDto,
})
