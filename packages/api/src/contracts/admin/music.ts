import { idString, isoDateTime } from '@kobato/api/contracts/primitives'
import { z } from 'zod'

export const METING_SOURCES = ['netease', 'tencent'] as const
const metingSource = z.enum(METING_SOURCES)
export type MetingSource = z.infer<typeof metingSource>

const adminMusicDto = z.object({
  id: idString,
  source: metingSource,
  sourceId: z.string(),
  playerId: z.string(),
  name: z.string(),
  artist: z.array(z.string()),
  album: z.string(),
  audioStoragePath: z.string(),
  audioUrl: z.string(),
  coverStoragePath: z.string(),
  coverUrl: z.string(),
  lyric: z.string().nullable(),
  uploaderId: idString.nullable(),
  uploaderName: z.string().nullable(),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
})
export type AdminMusicDto = z.infer<typeof adminMusicDto>

const metingSearchHitDto = z.object({
  source: metingSource,
  sourceId: z.string(),
  name: z.string(),
  artist: z.array(z.string()),
  album: z.string(),
  coverUrl: z.string(),
  previewUrl: z.string(),
})
export type MetingSearchHit = z.infer<typeof metingSearchHitDto>

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

export const adminMusicListInput = z.object({
  q: z.string().optional(),
  offset: z.coerce.number().optional(),
  limit: z.coerce.number().optional(),
  sortBy: z.enum(['createdAt', 'updatedAt', 'name', 'artist', 'album']).optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
})
export type AdminMusicListInput = z.infer<typeof adminMusicListInput>

export const adminMusicSearchInput = z.object({
  source: metingSource.optional(),
  keyword: z.string(),
  limit: z.coerce.number().optional(),
  offset: z.coerce.number().int().nonnegative().optional(),
})
export type AdminMusicSearchInput = z.infer<typeof adminMusicSearchInput>

export const adminMusicAddInput = z.object({
  source: metingSource,
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
