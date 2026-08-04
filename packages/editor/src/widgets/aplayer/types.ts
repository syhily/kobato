export type ArtistInfo = {
  name?: string
  url?: string
}

export type AudioInfo = {
  name?: string
  artist?: string | ArtistInfo
  url: string
  cover?: string
  lrc?: string
  theme?: string
  type?: 'auto' | 'hls' | 'normal'
}
