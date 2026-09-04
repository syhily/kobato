import { describe, expect, it } from 'vitest'

import {
  emptyLexicalBody,
  lexicalBodyWith,
  lexicalHeading,
  lexicalImage,
  lexicalMusicPlayer,
  lexicalParagraph,
} from '#/_helpers/lexical'
import {
  collectLexicalHeadings,
  collectLexicalImageStoragePaths,
  collectLexicalMusicPlayerIds,
} from '@/shared/lexical/collect'

function quote(children: unknown[]) {
  return { type: 'extended-quote', version: 1, children, direction: 'ltr', format: '', indent: 0 }
}

describe('shared/lexical/collect — collectLexicalHeadings', () => {
  it('collects headings in document order with depth parsed from the tag', () => {
    const state = lexicalBodyWith([
      lexicalHeading('h1', 'Top'),
      lexicalParagraph('body'),
      lexicalHeading('h3', 'Deep'),
      quote([lexicalHeading('h2', 'Nested')]),
    ])

    expect(collectLexicalHeadings(state)).toEqual([
      { depth: 1, text: 'Top', slug: 'top' },
      { depth: 3, text: 'Deep', slug: 'deep' },
      { depth: 2, text: 'Nested', slug: 'nested' },
    ])
  })

  it('dedups slugs with the inkling tracker (base, base-1, base-2)', () => {
    const state = lexicalBodyWith([
      lexicalHeading('h2', 'Repeat'),
      lexicalHeading('h2', 'Repeat'),
      lexicalHeading('h2', 'repeat'),
    ])

    expect(collectLexicalHeadings(state).map((h) => h.slug)).toEqual(['repeat', 'repeat-1', 'repeat-2'])
  })

  it('keeps CJK characters and percent-encodes them (inkling >=4.0 policy, not github-slugger)', () => {
    const state = lexicalBodyWith([lexicalHeading('h2', '你好 世界')])

    expect(collectLexicalHeadings(state)).toEqual([
      { depth: 2, text: '你好 世界', slug: encodeURIComponent('你好-世界') },
    ])
  })

  it('strips symbols, collapses whitespace, trims edge dashes', () => {
    const state = lexicalBodyWith([lexicalHeading('h2', '  Foo! Bar?  baz  ')])

    expect(collectLexicalHeadings(state)[0]).toEqual({ depth: 2, text: 'Foo! Bar?  baz', slug: 'foo-bar-baz' })
  })

  it('drops empty-text entries but still feeds the tracker (export-pass parity)', () => {
    // The whitespace-only heading slugifies to '' and consumes the base id;
    // the symbol-only heading then gets '-1' instead of the base.
    const state = lexicalBodyWith([lexicalHeading('h2', '   '), lexicalHeading('h2', '!!!')])

    expect(collectLexicalHeadings(state)).toEqual([{ depth: 2, text: '!!!', slug: '-1' }])
  })

  it('skips headings whose tag is not h1-h6', () => {
    const state = lexicalBodyWith([
      { type: 'extended-heading', version: 1, tag: 'div', direction: 'ltr', format: '', indent: 0, children: [] },
    ])

    expect(collectLexicalHeadings(state as never)).toEqual([])
  })

  it('returns [] for a body without headings', () => {
    expect(collectLexicalHeadings(lexicalBodyWith([lexicalParagraph('x')]))).toEqual([])
    expect(collectLexicalHeadings(emptyLexicalBody())).toEqual([])
  })
})

describe('shared/lexical/collect — collectLexicalImageStoragePaths', () => {
  it('dedups storage paths in first-seen order, skipping blanks and missing keys', () => {
    const state = lexicalBodyWith([
      lexicalImage({ storagePath: 'a/1.jpg' }),
      quote([lexicalImage({ storagePath: 'b/2.jpg' })]),
      lexicalImage({ storagePath: 'a/1.jpg' }),
      lexicalImage({ storagePath: '' }),
      lexicalImage(),
    ])

    expect(collectLexicalImageStoragePaths(state)).toEqual(['a/1.jpg', 'b/2.jpg'])
  })

  it('returns [] when no image carries a storagePath', () => {
    expect(collectLexicalImageStoragePaths(lexicalBodyWith([lexicalParagraph('x')]))).toEqual([])
  })
})

describe('shared/lexical/collect — collectLexicalMusicPlayerIds', () => {
  it('dedups player ids in first-seen order, skipping blanks', () => {
    const state = lexicalBodyWith([
      lexicalMusicPlayer('p1'),
      quote([lexicalMusicPlayer('p2')]),
      lexicalMusicPlayer('p1'),
      lexicalMusicPlayer(''),
    ])

    expect(collectLexicalMusicPlayerIds(state)).toEqual(['p1', 'p2'])
  })
})
