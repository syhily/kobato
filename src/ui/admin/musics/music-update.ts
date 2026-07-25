import type { AdminMusicDto } from '@/shared/contracts/music'

// The detail view's edit draft: name / album stay plain strings, artist is
// edited as a single `/`-separated string and split back into the list
// shape the update procedure expects.
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

/**
 * Build the update-procedure input from the edit draft. A blank name /
 * artist / album draft falls back to the stored value, so clearing a field
 * never wipes it; a blank lyric maps to undefined.
 */
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
