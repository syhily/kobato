import type { AdminMusicDto, AdminMusicUpdateInput } from '@kobato/contracts/music'

export interface MusicEditDraft {
  name: string
  artist: string
  album: string
  lyric?: string
}

export function splitArtistDraft(draft: string): string[] {
  return draft
    .split('/')
    .map((name) => name.trim())
    .filter((name) => name !== '')
}

export function buildMusicUpdate(
  music: Pick<AdminMusicDto, 'id' | 'name' | 'artist' | 'album'>,
  draft: MusicEditDraft,
): AdminMusicUpdateInput {
  const artist = splitArtistDraft(draft.artist)
  return {
    id: music.id,
    name: draft.name.trim() || music.name,
    artist: artist.length > 0 ? artist : music.artist,
    album: draft.album.trim() || music.album,
    lyric: draft.lyric?.trim() || undefined,
  }
}
