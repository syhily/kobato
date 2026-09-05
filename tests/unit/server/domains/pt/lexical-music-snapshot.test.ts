import { describe, expect, it } from 'vitest'

import { lexicalBodyWith, lexicalMusicPlayer, lexicalParagraph, stubMusicResolver } from '#/_helpers/lexical'
import { snapshotMusicPlayerMeta } from '@/server/domains/pt/lexical-music-snapshot'
import { lexicalEditorStateSchema } from '@/shared/lexical/schema'

const META = {
  id: 'p1',
  name: 'Song',
  artist: 'Artist',
  album: 'Album',
  url: 'https://cdn/song.mp3',
  pic: 'https://cdn/cover.jpg',
  lyric: '[00:00]la',
}

// zod parse clones — always assert against the PARSED state's nodes.
function parse(state: unknown) {
  return lexicalEditorStateSchema.parse(state)
}

function at(state: ReturnType<typeof parse>, ...path: number[]): Record<string, unknown> {
  let node: Record<string, unknown> = state.root as unknown as Record<string, unknown>
  for (const index of path) {
    node = (node.children as Record<string, unknown>[])[index]!
  }
  return node
}

describe('pt/lexical-music-snapshot — snapshotMusicPlayerMeta', () => {
  it('embeds the resolved meta snapshot into every matching music-player node', async () => {
    const state = parse(
      lexicalBodyWith([
        lexicalMusicPlayer('p1'),
        {
          type: 'extended-quote',
          version: 1,
          direction: 'ltr',
          format: '',
          indent: 0,
          children: [lexicalMusicPlayer('p1')],
        },
      ]),
    )

    await snapshotMusicPlayerMeta(state, stubMusicResolver({ p1: META }))

    for (const node of [at(state, 0), at(state, 1, 0)]) {
      expect(node).toMatchObject({
        playerId: 'p1',
        name: 'Song',
        artist: 'Artist',
        cover: 'https://cdn/cover.jpg',
        audioUrl: 'https://cdn/song.mp3',
        lyric: '[00:00]la',
      })
    }
  })

  it('stores site-owned media URLs origin-relative, whatever origin they were baked under', async () => {
    const state = parse(lexicalBodyWith([lexicalMusicPlayer('p1')]))

    await snapshotMusicPlayerMeta(
      state,
      stubMusicResolver({
        p1: { ...META, url: 'https://old-env.example.com/storage/musics/a.mp3?v=1', pic: '/storage/musics/a.jpg' },
      }),
    )

    expect(at(state, 0)).toMatchObject({
      cover: '/storage/musics/a.jpg',
      audioUrl: '/storage/musics/a.mp3',
    })
  })

  it('leaves unresolved playerIds meta-less', async () => {
    const state = parse(lexicalBodyWith([lexicalMusicPlayer('missing')]))

    await snapshotMusicPlayerMeta(state, stubMusicResolver())

    expect(at(state, 0)).not.toHaveProperty('name')
    expect(at(state, 0)).not.toHaveProperty('audioUrl')
  })

  it('never calls the resolver for a body without music-player nodes', async () => {
    const state = parse(lexicalBodyWith([lexicalParagraph('x')]))
    let called = false
    await snapshotMusicPlayerMeta(state, async () => {
      called = true
      return new Map()
    })
    expect(called).toBe(false)
  })

  it('degrades a throwing resolver to a log line — the state stays meta-less', async () => {
    const state = parse(lexicalBodyWith([lexicalMusicPlayer('p1')]))

    await expect(
      snapshotMusicPlayerMeta(state, async () => {
        throw new Error('library down')
      }),
    ).resolves.toBeUndefined()
    expect(at(state, 0)).not.toHaveProperty('name')
  })

  it('passes the deduped player ids to the resolver', async () => {
    const state = parse(lexicalBodyWith([lexicalMusicPlayer('p1'), lexicalMusicPlayer('p2'), lexicalMusicPlayer('p1')]))
    let seen: readonly string[] = []
    await snapshotMusicPlayerMeta(state, async (ids) => {
      seen = ids
      return new Map()
    })
    expect(seen).toEqual(['p1', 'p2'])
  })
})
