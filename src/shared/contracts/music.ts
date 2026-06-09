import { z } from 'zod'

import type { Assert, Equals } from '@/shared/contracts/primitives'
import type {
  ListMusicOutput,
  PublicMusicMeta,
  SearchMusicOutput,
  AddMusicOutput,
  UpdateMusicOutput,
  AdminMusicDto,
} from '@/shared/types/music'

import { idString, isoDateTime } from '@/shared/contracts/primitives'

const metingSource = z.enum(['netease'])

export const publicMusicMetaDto = z.object({
  id: z.string(),
  name: z.string(),
  artist: z.string(),
  album: z.string(),
  url: z.string(),
  pic: z.string(),
  lyric: z.string(),
})

export const listMusicOutputDto = z.object({
  musics: z.array(
    z.object({
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
    }),
  ),
  total: z.number().int().nonnegative(),
  hasMore: z.boolean(),
})

export const searchMusicOutputDto = z.object({
  results: z.array(
    z.object({
      source: metingSource,
      sourceId: z.string(),
      name: z.string(),
      artist: z.array(z.string()),
      album: z.string(),
      coverUrl: z.string(),
      previewUrl: z.string(),
    }),
  ),
})

export const addMusicOutputDto = z.object({
  music: z.object({
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
  }),
})

export const updateMusicOutputDto = z.object({
  music: z.object({
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
  }),
})

export const getMusicOutputDto = z.object({
  music: z.object({
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
  }),
})

// ─── parity assertions ─────────────────────────────────
type _publicMusicMetaParity = Assert<Equals<z.infer<typeof publicMusicMetaDto>, PublicMusicMeta>>
type _listMusicOutputParity = Assert<Equals<z.infer<typeof listMusicOutputDto>, ListMusicOutput>>
type _searchMusicOutputParity = Assert<Equals<z.infer<typeof searchMusicOutputDto>, SearchMusicOutput>>
type _addMusicOutputParity = Assert<Equals<z.infer<typeof addMusicOutputDto>, AddMusicOutput>>
type _updateMusicOutputParity = Assert<Equals<z.infer<typeof updateMusicOutputDto>, UpdateMusicOutput>>
type _getMusicOutputParity = Assert<Equals<z.infer<typeof getMusicOutputDto>, { music: AdminMusicDto }>>
