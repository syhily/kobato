import { getTKMatch } from '@kobato/inkling-internal/plugins/behaviour/tk-matcher'
import { describe, expect, it } from 'vitest'

const MATCH_CASES: Array<[string, { start: number; end: number } | null]> = [
  ['', null],
  ['hello world', null],

  ['TK', { start: 0, end: 2 }],
  ['Tk', { start: 0, end: 2 }],
  ['tk', { start: 0, end: 2 }],
  ['hello TK', { start: 6, end: 8 }],
  ['a tk b', { start: 2, end: 4 }],
  ['TK TK', { start: 0, end: 2 }],

  ['hello TK!', { start: 6, end: 9 }],
  ['(TK)', { start: 0, end: 4 }],
  ['...TK...', { start: 0, end: 8 }],

  ['wordTK', null],
  ['TKw', null],
  ['wordTKword', null],
  ['éTK', null],

  ['foo—TK bar', { start: 3, end: 6 }],
  ['TK—foo', { start: 0, end: 3 }],
  ['word—TK', { start: 4, end: 7 }],
  ['—TK—', { start: 0, end: 4 }],

  ['héllo TK', { start: 6, end: 8 }],
  ['xTK TK', { start: 4, end: 6 }],
  ['TKs TK', { start: 4, end: 6 }],
  ['oneTK two TKthree TK', { start: 18, end: 20 }],

  ['xTK yTK zTK', null],
]
describe('getTKMatch', () => {
  it.each(MATCH_CASES)('%j -> %j', (text, expected) => {
    expect(getTKMatch(text)).toEqual(expected)
  })
})
