import { describe, expect, it } from 'vitest'

import { getTKMatch } from '@/plugins/behaviour/tk-matcher'

// Data-driven pins for the TK entity matcher
// (src/plugins/behaviour/tk-matcher.ts). Offsets are UTF-16 code-unit indexes
// into the input; the match spans the TK plus any adjacent symbol chars.
// Editor wiring (useInklingTextEntity transforms, indicators) lives in
// test/unit/plugins/TKPlugin.test.tsx.

const MATCH_CASES: Array<[string, { start: number; end: number } | null]> = [
  // empty / no match
  ['', null],
  ['hello world', null],

  // bare TK in every case variant
  ['TK', { start: 0, end: 2 }],
  ['Tk', { start: 0, end: 2 }],
  ['tk', { start: 0, end: 2 }],
  ['hello TK', { start: 6, end: 8 }],
  ['a tk b', { start: 2, end: 4 }],
  ['TK TK', { start: 0, end: 2 }],

  // leading/trailing symbol chars are part of the match
  ['hello TK!', { start: 6, end: 9 }],
  ['(TK)', { start: 0, end: 4 }],
  ['...TK...', { start: 0, end: 8 }],

  // word chars adjacent to the TK invalidate the match
  ['wordTK', null],
  ['TKw', null],
  ['wordTKword', null],
  ['éTK', null],

  // em-dash adjacency shields the TK from the neighbouring word char
  ['foo—TK bar', { start: 3, end: 6 }],
  ['TK—foo', { start: 0, end: 3 }],
  ['word—TK', { start: 4, end: 7 }],
  ['—TK—', { start: 0, end: 4 }],

  // invalid matches are skipped, keeping original-input offsets
  ['héllo TK', { start: 6, end: 8 }],
  ['xTK TK', { start: 4, end: 6 }],
  ['TKs TK', { start: 4, end: 6 }],
  ['oneTK two TKthree TK', { start: 18, end: 20 }],

  // chained invalid matches consume their separator, cascading to no match
  ['xTK yTK zTK', null],
]

describe('getTKMatch', () => {
  it.each(MATCH_CASES)('%j -> %j', (text, expected) => {
    expect(getTKMatch(text)).toEqual(expected)
  })
})
