import { idString, isoDateTime } from '@kobato/contracts/primitives.ts'
import { z } from 'zod'

const metingSource = z.enum(['netease', 'tencent'])
export type MetingSource = z.infer<typeof metingSource>

const adminMusicDto = z.object({
  id: idString,
  source: metingSource,
  sourceId: z.string(),
  // Opaque 16-char `[a-z0-9]` handle referenced by `musicPlayer` blocks as `playerId`.
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
  // Direct streaming URL from the upstream provider — short-lived (token-signed,
  // ~1h on netease) and NOT persisted; only for the dialog's `<audio>` preview.
  previewUrl: z.string(),
})
export type MetingSearchHit = z.infer<typeof metingSearchHitDto>

// Public GET payload for the browser-side `<MusicPlayer />` so APlayer can render.
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

// Admin music wire inputs — the single Zod source the `@kobato/api` music
// contract composes and the server validates against.

export const adminMusicListInput = z.object({
  q: z.string().optional(),
  offset: z.coerce.number().optional(),
  limit: z.coerce.number().optional(),
  sortBy: z.enum(['createdAt', 'updatedAt', 'name', 'artist', 'album']).optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
})
export type AdminMusicListInput = z.infer<typeof adminMusicListInput>

export const adminMusicSearchInput = z.object({
  source: z.enum(['netease', 'tencent']).optional(),
  keyword: z.string(),
  limit: z.coerce.number().optional(),
  offset: z.coerce.number().int().nonnegative().optional(),
})
export type AdminMusicSearchInput = z.infer<typeof adminMusicSearchInput>

export const adminMusicAddInput = z.object({
  source: z.enum(['netease', 'tencent']),
  sourceId: z.string().trim().min(1).max(64),
})
export type AdminMusicAddInput = z.infer<typeof adminMusicAddInput>

export const adminMusicUpdateInput = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(200),
  artist: z.array(z.string().trim().min(1).max(80)).min(1).max(20),
  album: z.string().trim().max(200).optional().default(''),
  lyric: z.string().max(50_000).optional(),
})
export type AdminMusicUpdateInput = z.infer<typeof adminMusicUpdateInput>

export const adminMusicIdInput = z.object({ id: z.string().min(1) })
export type AdminMusicIdInput = z.infer<typeof adminMusicIdInput>

// Public `music.get` surface — the opaque 16-char player handle referenced by
// `musicPlayer` blocks; the DTO is the browser player payload.
export const musicGetInputSchema = z.object({
  id: z
    .string()
    .trim()
    .regex(/^[a-z0-9]{16}$/, 'invalid player id'),
})
export type MusicGetInput = z.input<typeof musicGetInputSchema>

export const musicGetOutputSchema = z.object({ music: publicMusicMetaDto })
export type MusicGetOutput = z.infer<typeof musicGetOutputSchema>
