import type { AdminMusicDto } from '@/shared/contracts/music'

// Edit draft: the single `/`-separated artist string splits back into the list shape the update expects.
export interface MusicEditDraft {
  name: string
  artist: string
  album: string
  lyric?: string
}

export interface MusicUpdateInput {
  id: string
  name: string
  artist: string[]
  album: string
  lyric?: string
}

/** Split the `/`-separated artist draft into trimmed, non-empty names. */
export function splitArtistDraft(draft: string): string[] {
  return draft
    .split('/')
    .map((name) => name.trim())
    .filter((name) => name !== '')
}

/** Build the update input from the edit draft; blank name/artist/album fall
 *  back to the stored value (clearing never wipes), blank lyric → undefined. */
export function buildMusicUpdate(
  music: Pick<AdminMusicDto, 'id' | 'name' | 'artist' | 'album'>,
  draft: MusicEditDraft,
): MusicUpdateInput {
  const artist = splitArtistDraft(draft.artist)
  return {
    id: music.id,
    name: draft.name.trim() || music.name,
    artist: artist.length > 0 ? artist : music.artist,
    album: draft.album.trim() || music.album,
    lyric: draft.lyric?.trim() || undefined,
  }
}
