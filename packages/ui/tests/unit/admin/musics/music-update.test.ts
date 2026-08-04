import type { AdminMusicDto } from '@kobato/shared/contracts/music'

import { buildMusicUpdate, splitArtistDraft } from '@kobato/ui/admin/musics/music-update'
import { describe, expect, it } from 'vitest'

const music: Pick<AdminMusicDto, 'id' | 'name' | 'artist' | 'album'> = {
  id: 'music-1',
  name: '青花瓷',
  artist: ['周杰伦'],
  album: '我很忙',
}

describe('splitArtistDraft', () => {
  it('splits on slashes and trims each name', () => {
    expect(splitArtistDraft('周杰伦/费玉清')).toEqual(['周杰伦', '费玉清'])
    expect(splitArtistDraft('周杰伦 / 费玉清 /  邓丽君  ')).toEqual(['周杰伦', '费玉清', '邓丽君'])
  })

  it('drops empty segments', () => {
    expect(splitArtistDraft('周杰伦 // 费玉清 /')).toEqual(['周杰伦', '费玉清'])
  })

  it('returns [] for a blank draft', () => {
    expect(splitArtistDraft('')).toEqual([])
    expect(splitArtistDraft('  /  ')).toEqual([])
  })
})

describe('buildMusicUpdate', () => {
  it('maps a full draft into the update input', () => {
    expect(
      buildMusicUpdate(music, {
        name: '  千里之外  ',
        artist: '周杰伦 / 费玉清',
        album: ' 依然范特西 ',
        lyric: ' [00:01.00]屋檐如悬崖 ',
      }),
    ).toEqual({
      id: 'music-1',
      name: '千里之外',
      artist: ['周杰伦', '费玉清'],
      album: '依然范特西',
      lyric: '[00:01.00]屋檐如悬崖',
    })
  })

  it('falls back to the stored values for blank name / artist / album drafts', () => {
    expect(buildMusicUpdate(music, { name: '   ', artist: ' / ', album: '' })).toEqual({
      id: 'music-1',
      name: '青花瓷',
      artist: ['周杰伦'],
      album: '我很忙',
      lyric: undefined,
    })
  })

  it('maps a blank or missing lyric draft to undefined', () => {
    expect(
      buildMusicUpdate(music, { name: '青花瓷', artist: '周杰伦', album: '我很忙', lyric: '   ' }).lyric,
    ).toBeUndefined()
    expect(buildMusicUpdate(music, { name: '青花瓷', artist: '周杰伦', album: '我很忙' }).lyric).toBeUndefined()
  })
})
