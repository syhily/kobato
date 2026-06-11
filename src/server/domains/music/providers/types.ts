export interface ProviderSearchHit {
  source: string
  sourceId: string
  name: string
  artist: string[]
  album: string
  coverUrl: string
  previewUrl: string
}

export interface ProviderTrack {
  source: string
  sourceId: string
  name: string
  artist: string[]
  album: string
  picId: string
  urlId: string
  lyricId: string
}

export interface MusicProvider {
  readonly source: string

  search(keyword: string, limit: number, offset?: number): Promise<ProviderSearchHit[]>

  getTrack(sourceId: string): Promise<ProviderTrack | null>

  resolveAudioUrl(track: ProviderTrack): Promise<string>

  resolveCoverUrl(track: ProviderTrack): Promise<string>

  getLyric(track: ProviderTrack): Promise<string | null>
}
