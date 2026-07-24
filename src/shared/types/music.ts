// Wire-format DTOs for the music management endpoints. The row/result
// DTOs (`AdminMusicDto`, `MetingSearchHit`, list/search/add/update
// outputs) are zod-derived in `@/shared/contracts/music`.

import type { MetingSource } from '@/shared/contracts/music'

export interface ListMusicInput {
  q?: string
  offset?: number
  limit?: number
  sortBy?: 'createdAt' | 'updatedAt' | 'name' | 'artist' | 'album'
  sortOrder?: 'asc' | 'desc'
}

export interface SearchMusicInput {
  source?: MetingSource
  keyword: string
  /** Defaults to 10, capped at 30 server-side. */
  limit?: number
  /** Number of results to skip for pagination. Defaults to 0. */
  offset?: number
}

export interface AddMusicInput {
  source: MetingSource
  sourceId: string
}

export interface DeleteMusicInput {
  id: string
}

export interface DeleteMusicOutput {
  success: boolean
}

// Metadata-only edit. Audio / cover bytes, provider id triplet,
// uploader, and timestamps are NOT editable from this surface.
export interface UpdateMusicInput {
  id: string
  name: string
  artist: string[]
  album?: string
  lyric?: string
}

// Resolved metadata embedded into a `musicPlayer` PortableText block at SSR time.
// Field names match the props expected by `<APlayer audio={...} />`.
export interface MusicPlayerBlockMeta {
  id: string
  name: string
  artist: string
  cover: string
  audioUrl: string
  lyric: string
}
