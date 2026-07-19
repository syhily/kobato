// Wire-format DTOs for the music management endpoints.

export type MetingSource = 'netease' | 'tencent'

export interface MetingSearchHit {
  source: MetingSource
  /** Provider-side song id, stringified for transport stability. */
  sourceId: string
  name: string
  artist: string[]
  album: string
  /** Pre-resolved cover URL for the search result thumbnail. */
  coverUrl: string
  /**
   * Direct streaming URL returned by the upstream provider. These URLs
   * are short-lived (token-signed, ~1h on netease) and intentionally
   * NOT persisted — they exist only so the dialog's `<audio>` element
   * can preview the song before it gets imported.
   */
  previewUrl: string
}

export interface AdminMusicDto {
  id: string
  source: MetingSource
  sourceId: string
  /** Opaque 16-char `[a-z0-9]` handle. Referenced by `musicPlayer` PortableText blocks as `playerId`. */
  playerId: string
  name: string
  artist: string[]
  album: string
  audioStoragePath: string
  audioUrl: string
  coverStoragePath: string
  coverUrl: string
  /** LRC text. `null` when the upstream provider had no lyric. */
  lyric: string | null
  uploaderId: string | null
  uploaderName: string | null
  createdAt: string
  updatedAt: string
}

export interface ListMusicInput {
  q?: string
  offset?: number
  limit?: number
  sortBy?: 'createdAt' | 'updatedAt' | 'name' | 'artist' | 'album'
  sortOrder?: 'asc' | 'desc'
}

export interface ListMusicOutput {
  musics: AdminMusicDto[]
  total: number
  hasMore: boolean
}

export interface SearchMusicInput {
  source?: MetingSource
  keyword: string
  /** Defaults to 10, capped at 30 server-side. */
  limit?: number
  /** Number of results to skip for pagination. Defaults to 0. */
  offset?: number
}

export interface SearchMusicOutput {
  results: MetingSearchHit[]
  hasMore: boolean
}

export interface AddMusicInput {
  source: MetingSource
  sourceId: string
}

export interface AddMusicOutput {
  music: AdminMusicDto
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

export interface UpdateMusicOutput {
  music: AdminMusicDto
}

// Public GET payload — what `/api/music/get?id=...` returns
// to the browser-side `<MusicPlayer />` so APlayer can render.
export interface PublicMusicMeta {
  id: string
  name: string
  artist: string
  album: string
  url: string
  pic: string
  lyric: string
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
