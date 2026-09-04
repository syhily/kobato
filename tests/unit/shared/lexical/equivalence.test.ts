import { describe, expect, it } from 'vitest'

import {
  emptyLexicalBody,
  lexicalBodyWith,
  lexicalImage,
  lexicalMusicPlayer,
  lexicalParagraph,
} from '#/_helpers/lexical'
import { areLexicalEditorStatesEquivalent, lexicalEditorStateFingerprint } from '@/shared/lexical/equivalence'
import { lexicalEditorStateSchema } from '@/shared/lexical/schema'

// Both sides MUST be zod-parsed states (the parse strips unknown keys and
// pins the required-field shape); fixtures below parse through the real
// schema so the tests exercise the contract callers rely on.
function parse(state: unknown) {
  return lexicalEditorStateSchema.parse(state)
}

describe('shared/lexical/equivalence', () => {
  it('is insensitive to key order', () => {
    const a = parse(lexicalBodyWith([lexicalParagraph('hi')]))
    const reordered = JSON.parse(
      JSON.stringify(lexicalBodyWith([lexicalParagraph('hi')])),
      // Reverse every object's key order on the way in.
      function (this: unknown, _key: string, value: unknown) {
        if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
          const record = value as Record<string, unknown>
          // The lib target has no toReversed(); reduceRight reinserts keys in reverse order.
          return Object.fromEntries(
            Object.entries(record).reduceRight<Array<[string, unknown]>>((acc, entry) => {
              acc.push(entry)
              return acc
            }, []),
          )
        }
        return value
      },
    )
    const b = parse(reordered)

    expect(areLexicalEditorStatesEquivalent(a, b)).toBe(true)
  })

  it('ignores server-filled artifact slots (codeblock highlightedHtml)', () => {
    const bare = parse(
      lexicalBodyWith([
        { type: 'codeblock', version: 1, code: 'const a = 1', language: 'ts', caption: '', highlightedHtml: '' },
      ]),
    )
    const filled = parse(
      lexicalBodyWith([
        { type: 'codeblock', version: 1, code: 'const a = 1', language: 'ts', caption: '', highlightedHtml: '<pre/>' },
      ]),
    )

    expect(areLexicalEditorStatesEquivalent(bare, filled)).toBe(true)
  })

  it('ignores math/math-inline mathml+svg slots', () => {
    const bare = parse(lexicalBodyWith([{ type: 'math', version: 1, tex: 'x^2', mathml: '', svg: '' }]))
    const filled = parse(lexicalBodyWith([{ type: 'math', version: 1, tex: 'x^2', mathml: '<math/>', svg: '<svg/>' }]))

    expect(areLexicalEditorStatesEquivalent(bare, filled)).toBe(true)
  })

  it('ignores the music-player meta snapshot but not the playerId', () => {
    const bare = parse(lexicalBodyWith([lexicalMusicPlayer('p1')]))
    const snapshotted = parse(
      lexicalBodyWith([lexicalMusicPlayer('p1', { name: 'Song', artist: 'A', cover: 'c', audioUrl: 'u', lyric: 'l' })]),
    )
    const otherPlayer = parse(lexicalBodyWith([lexicalMusicPlayer('p2')]))

    expect(areLexicalEditorStatesEquivalent(bare, snapshotted)).toBe(true)
    expect(areLexicalEditorStatesEquivalent(bare, otherPlayer)).toBe(false)
  })

  it('treats real content differences as dirty', () => {
    const a = parse(lexicalBodyWith([lexicalParagraph('hi')]))
    const b = parse(lexicalBodyWith([lexicalParagraph('bye')]))

    expect(areLexicalEditorStatesEquivalent(a, b)).toBe(false)
    expect(areLexicalEditorStatesEquivalent(a, parse(emptyLexicalBody()))).toBe(false)
  })

  it('does NOT elide empty values — present-but-empty differs from absent (unlike the PT fingerprint)', () => {
    const withEmpty = parse(lexicalBodyWith([lexicalImage({ thumbhash: '' })]))
    const without = parse(lexicalBodyWith([lexicalImage()]))

    expect(areLexicalEditorStatesEquivalent(withEmpty, without)).toBe(false)
  })

  it('produces a stable fingerprint string for identical states', () => {
    const a = parse(lexicalBodyWith([lexicalParagraph('hi')]))
    const b = parse(lexicalBodyWith([lexicalParagraph('hi')]))

    expect(lexicalEditorStateFingerprint(a)).toBe(lexicalEditorStateFingerprint(b))
    expect(typeof lexicalEditorStateFingerprint(a)).toBe('string')
  })
})
