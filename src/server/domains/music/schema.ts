import { z } from 'zod'

// Zod schemas for the music admin API surface. `source` is a literal
// for now (`'netease'` only) so the wire envelope stays forward-
// compatible with future providers — adding `'tencent'` later means
// widening this union and supplying a matching Meting wrapper.

export const metingSourceSchema = z.enum(['netease', 'tencent'])

export const listMusicSchema = z.object({
  q: z.string().trim().max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  sortBy: z.enum(['createdAt', 'updatedAt', 'name', 'artist', 'album']).optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
})

export const searchMusicSchema = z.object({
  keyword: z.string().trim().min(1, '请输入搜索关键词').max(100),
  limit: z.coerce.number().int().min(1).max(30).optional(),
})

export const addMusicSchema = z.object({
  source: metingSourceSchema,
  sourceId: z.string().trim().min(1).max(64),
})

export const deleteMusicSchema = z.object({
  id: z.string().trim().min(1),
})

// Metadata-only edit. Audio / cover bytes and provider triplet
// (source, sourceId, playerId) are intentionally NOT mutable from
// this surface — those are owned by the upload pipeline. Lyrics
// accept an empty string (cleared) but the wire layer normalises
// `''` to `null` server-side so the column matches the upstream
// "no lyric" representation.
export const updateMusicSchema = z.object({
  id: z.string().trim().min(1),
  name: z.string().trim().min(1, '请输入歌名').max(200),
  artist: z.array(z.string().trim().min(1).max(80)).min(1, '至少填写一位歌手').max(20),
  album: z.string().trim().max(200).optional().default(''),
  lyric: z
    .string()
    .max(50_000, '歌词过长')
    .optional()
    .transform((value) => (value === undefined || value.trim() === '' ? null : value)),
})

export const publicMusicGetSchema = z.object({
  id: z
    .string()
    .trim()
    .regex(/^[a-z0-9]{16}$/, 'invalid player id'),
})

export type ListMusicInput = z.infer<typeof listMusicSchema>
export type SearchMusicInput = z.infer<typeof searchMusicSchema>
export type AddMusicInput = z.infer<typeof addMusicSchema>
export type DeleteMusicInput = z.infer<typeof deleteMusicSchema>
export type UpdateMusicInput = z.infer<typeof updateMusicSchema>
export type PublicMusicGetInput = z.infer<typeof publicMusicGetSchema>
