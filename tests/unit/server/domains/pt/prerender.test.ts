import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { MusicEmbedResolver } from '@/server/domains/pt/embeds'
import type { PublicMusicMeta } from '@/shared/contracts/music'
import type { EnrichedMusicPlayerBlock } from '@/shared/pt/enriched'
import type { FootnoteDefinitionBlock, PortableTextBody, SolutionBlock, TwoColumnBlock } from '@/shared/pt/schema'

import { prerenderMusicPlayerBlocks } from '@/server/domains/pt/prerender'

// The music meta lookup arrives through the injected PT embed seam, so the
// suite stubs the resolver directly — no module mock of the music domain.
const resolveMusicEmbeds = vi.fn<MusicEmbedResolver>()

beforeEach(() => {
  resolveMusicEmbeds.mockReset()
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

function makeMetaMap(...entries: PublicMusicMeta[]): Map<string, PublicMusicMeta> {
  return new Map(entries.map((meta) => [meta.id, meta]))
}

describe('server/domains/pt/prerenderMusicPlayerBlocks', () => {
  it('returns null when the body is null', async () => {
    const result = await prerenderMusicPlayerBlocks(null, resolveMusicEmbeds)
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

    const result = await prerenderMusicPlayerBlocks(body, resolveMusicEmbeds)
    expect(result).toEqual(body)
    expect(resolveMusicEmbeds).not.toHaveBeenCalled()
  })

  it('resolves music metadata for top-level musicPlayer blocks with one batch call', async () => {
    resolveMusicEmbeds.mockResolvedValue(
      makeMetaMap(
        makeMusicMeta({ id: 'playeroneeeeeeeeee', name: 'One' }),
        makeMusicMeta({ id: 'playertwooooooooooo', name: 'Two' }),
      ),
    )

    const body: PortableTextBody = [
      { _type: 'musicPlayer', _key: 'm1', playerId: 'playeroneeeeeeeeee', auto: true },
      { _type: 'musicPlayer', _key: 'm2', playerId: 'playertwooooooooooo', center: true },
      { _type: 'musicPlayer', _key: 'm3', playerId: 'missingggggggggggg' },
    ]

    const result = await prerenderMusicPlayerBlocks(body, resolveMusicEmbeds)
    expect(result).toHaveLength(3)

    const first = result![0] as EnrichedMusicPlayerBlock
    expect(first._type).toBe('musicPlayer')
    expect(first.meta).toEqual({
      id: 'playeroneeeeeeeeee',
      name: 'One',
      artist: 'Artist',
      cover: 'https://example.com/playeroneeeeeeeeee.jpg',
      audioUrl: 'https://example.com/playeroneeeeeeeeee.mp3',
      lyric: '',
    })

    const third = result![2] as EnrichedMusicPlayerBlock
    expect(third._type).toBe('musicPlayer')
    expect(third.meta).toBeUndefined()

    // Every player id is resolved by a single batch query, not per-block calls.
    expect(resolveMusicEmbeds).toHaveBeenCalledTimes(1)
    expect(resolveMusicEmbeds).toHaveBeenCalledWith(['playeroneeeeeeeeee', 'playertwooooooooooo', 'missingggggggggggg'])
  })

  it('resolves music players nested in solution, footnoteDefinition, and twoColumn blocks', async () => {
    resolveMusicEmbeds.mockResolvedValue(makeMetaMap(makeMusicMeta({ id: 'nestedoneeeeeeeeee', name: 'Nested' })))

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

    const result = await prerenderMusicPlayerBlocks(body, resolveMusicEmbeds)
    expect(result).toHaveLength(3)

    const solution = result![0] as SolutionBlock
    expect(solution._type).toBe('solution')
    expect((solution.children[0] as EnrichedMusicPlayerBlock).meta).toBeDefined()

    const footnote = result![1] as FootnoteDefinitionBlock
    expect(footnote._type).toBe('footnoteDefinition')
    expect((footnote.children[0] as EnrichedMusicPlayerBlock).meta).toBeDefined()

    const twoColumn = result![2] as TwoColumnBlock
    expect(twoColumn._type).toBe('twoColumn')
    expect((twoColumn.left[0] as EnrichedMusicPlayerBlock).meta).toBeDefined()

    // The same playerId referenced three times is deduped into one batch call.
    expect(resolveMusicEmbeds).toHaveBeenCalledTimes(1)
    expect(resolveMusicEmbeds).toHaveBeenCalledWith(['nestedoneeeeeeeeee'])
  })

  it('leaves non-music blocks untouched', async () => {
    resolveMusicEmbeds.mockResolvedValue(new Map())

    const body: PortableTextBody = [
      {
        _type: 'block',
        _key: 'p1',
        style: 'normal',
        children: [{ _type: 'span', _key: 's1', text: 'hello' }],
      },
      { _type: 'musicPlayer', _key: 'm1', playerId: 'unknownggggggggggg' },
    ]

    const result = await prerenderMusicPlayerBlocks(body, resolveMusicEmbeds)
    const paragraph = result![0] as { _type: 'block'; children: unknown }
    expect(paragraph._type).toBe('block')
    expect(paragraph.children).toEqual([{ _type: 'span', _key: 's1', text: 'hello' }])
  })
})
