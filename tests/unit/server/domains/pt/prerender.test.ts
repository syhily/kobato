import { beforeEach, describe, expect, it, vi } from 'vitest'

import type {
  FootnoteDefinitionBlock,
  MusicPlayerBlock,
  PortableTextBody,
  SolutionBlock,
  TwoColumnBlock,
} from '@/shared/pt/schema'
import type { PublicMusicMeta } from '@/shared/types/music'

vi.mock('@/server/domains/music/services/read', () => ({
  getMusicMetaForPlayer: vi.fn(),
}))

import { getMusicMetaForPlayer } from '@/server/domains/music/services/read'
import { prerenderMusicPlayerBlocks } from '@/server/domains/pt/prerender'

const fakeDb = {} as never

beforeEach(() => {
  vi.mocked(getMusicMetaForPlayer).mockReset()
})

function makeMusicMeta(partial: Partial<PublicMusicMeta> & { id: string }): PublicMusicMeta {
  return {
    name: 'Song',
    artist: 'Artist',
    album: 'Album',
    url: `https://example.com/${partial.id}.mp3`,
    pic: `https://example.com/${partial.id}.jpg`,
    lyric: '',
    ...partial,
  }
}

describe('server/domains/pt/prerenderMusicPlayerBlocks', () => {
  it('returns null when the body is null', async () => {
    const result = await prerenderMusicPlayerBlocks(fakeDb, null)
    expect(result).toBeNull()
  })

  it('returns the original body when there are no musicPlayer blocks', async () => {
    const body: PortableTextBody = [
      {
        _type: 'block',
        _key: 'p1',
        style: 'normal',
        children: [{ _type: 'span', _key: 's1', text: 'hello' }],
      },
      { _type: 'horizontalRule', _key: 'hr1' },
    ]

    const result = await prerenderMusicPlayerBlocks(fakeDb, body)
    expect(result).toEqual(body)
    expect(getMusicMetaForPlayer).not.toHaveBeenCalled()
  })

  it('resolves music metadata for top-level musicPlayer blocks', async () => {
    vi.mocked(getMusicMetaForPlayer).mockImplementation(async (_db, playerId) => {
      if (playerId === 'playeroneeeeeeeeee') {
        return makeMusicMeta({ id: playerId, name: 'One' })
      }
      if (playerId === 'playertwooooooooooo') {
        return makeMusicMeta({ id: playerId, name: 'Two' })
      }
      return null
    })

    const body: PortableTextBody = [
      { _type: 'musicPlayer', _key: 'm1', playerId: 'playeroneeeeeeeeee', auto: true },
      { _type: 'musicPlayer', _key: 'm2', playerId: 'playertwooooooooooo', center: true },
      { _type: 'musicPlayer', _key: 'm3', playerId: 'missingggggggggggg' },
    ]

    const result = await prerenderMusicPlayerBlocks(fakeDb, body)
    expect(result).toHaveLength(3)

    const first = result![0] as MusicPlayerBlock
    expect(first._type).toBe('musicPlayer')
    expect(first.meta).toEqual({
      id: 'playeroneeeeeeeeee',
      name: 'One',
      artist: 'Artist',
      cover: 'https://example.com/playeroneeeeeeeeee.jpg',
      audioUrl: 'https://example.com/playeroneeeeeeeeee.mp3',
      lyric: '',
    })

    const third = result![2] as MusicPlayerBlock
    expect(third._type).toBe('musicPlayer')
    expect(third.meta).toBeUndefined()

    expect(getMusicMetaForPlayer).toHaveBeenCalledTimes(3)
  })

  it('resolves music players nested in solution, footnoteDefinition, and twoColumn blocks', async () => {
    vi.mocked(getMusicMetaForPlayer).mockImplementation(async (_db, playerId) => {
      if (playerId === 'nestedoneeeeeeeeee') {
        return makeMusicMeta({ id: playerId, name: 'Nested' })
      }
      return null
    })

    const body: PortableTextBody = [
      {
        _type: 'solution',
        _key: 'sol1',
        children: [{ _type: 'musicPlayer', _key: 'm1', playerId: 'nestedoneeeeeeeeee' }],
      },
      {
        _type: 'footnoteDefinition',
        _key: 'fn1',
        index: 1,
        children: [{ _type: 'musicPlayer', _key: 'm2', playerId: 'nestedoneeeeeeeeee' }],
      },
      {
        _type: 'twoColumn',
        _key: 'tc1',
        left: [{ _type: 'musicPlayer', _key: 'm3', playerId: 'nestedoneeeeeeeeee' }],
        right: [],
      },
    ]

    const result = await prerenderMusicPlayerBlocks(fakeDb, body)
    expect(result).toHaveLength(3)

    const solution = result![0] as SolutionBlock
    expect(solution._type).toBe('solution')
    expect((solution.children[0] as MusicPlayerBlock).meta).toBeDefined()

    const footnote = result![1] as FootnoteDefinitionBlock
    expect(footnote._type).toBe('footnoteDefinition')
    expect((footnote.children[0] as MusicPlayerBlock).meta).toBeDefined()

    const twoColumn = result![2] as TwoColumnBlock
    expect(twoColumn._type).toBe('twoColumn')
    expect((twoColumn.left[0] as MusicPlayerBlock).meta).toBeDefined()

    expect(getMusicMetaForPlayer).toHaveBeenCalledTimes(1)
  })

  it('leaves non-music blocks untouched', async () => {
    vi.mocked(getMusicMetaForPlayer).mockResolvedValue(null)

    const body: PortableTextBody = [
      {
        _type: 'block',
        _key: 'p1',
        style: 'normal',
        children: [{ _type: 'span', _key: 's1', text: 'hello' }],
      },
      { _type: 'musicPlayer', _key: 'm1', playerId: 'unknownggggggggggg' },
    ]

    const result = await prerenderMusicPlayerBlocks(fakeDb, body)
    const paragraph = result![0] as { _type: 'block'; children: unknown }
    expect(paragraph._type).toBe('block')
    expect(paragraph.children).toEqual([{ _type: 'span', _key: 's1', text: 'hello' }])
  })
})
