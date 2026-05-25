// Wire-format DTOs for the music management endpoints. Mirrors the
// images shared module: stringified bigints, public projection
// separate from the row, paginated list responses carry an explicit
// `total` so the table can render the pager without re-counting.
//
// Currently scoped to a single provider (`netease`) — see
// `MetingSource` in `@/server/domains/music/meting-types.d.ts`. Adding more
// providers later means widening the union and adding a Zod entry on
// the server side; the wire DTO already carries `source` so older
// clients keep parsing.

export type MetingSource = 'netease'

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
  /** Opaque 16-char `[a-z0-9]` handle. Quoted into MDX as `id="..."`. */
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
}

export interface ListMusicOutput {
  musics: AdminMusicDto[]
  total: number
  hasMore: boolean
}

export interface SearchMusicInput {
  keyword: string
  /** Defaults to 10, capped at 30 server-side. */
  limit?: number
}

export interface SearchMusicOutput {
  results: MetingSearchHit[]
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

// Metadata-only edit. Audio / cover bytes, provider id triplet
// (source, sourceId, playerId), uploader, and timestamps are NOT
// editable from this surface — only the human-curated columns the
// admin actually wants to override. `lyric === ''` clears the
// stored lyric (server-side normalised to NULL).
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
// to the browser-side `<MusicPlayer />` so APlayer can render. Kept
// intentionally aligned with the historical `MusicMeta` shape from
// the static `assets.example.com/musics/<id>.json` files so the legacy
// client code can switch to the new endpoint with a one-line URL
// change.
export interface PublicMusicMeta {
  id: string
  name: string
  artist: string
  album: string
  url: string
  pic: string
  lyric: string
}
