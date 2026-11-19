import {
  nextTkNodeKey,
  resolveTkIndicatorPosition,
  TK_INDICATOR_BASE_RIGHT,
  TK_INDICATOR_TOP_OFFSET,
  type TkIndicatorPosition,
  type TkRectLike,
} from '@kobato/inkling-internal/plugins/behaviour/tk-indicator'
import { describe, expect, it } from 'vitest'

describe('resolveTkIndicatorPosition', () => {
  const POSITION_CASES: Array<[string, TkRectLike | null, TkRectLike | null, TkIndicatorPosition]> = [
    [
      'default placement',
      { top: 0, right: 800 },
      { top: 100, right: 500 },
      { top: 100 + TK_INDICATOR_TOP_OFFSET, right: TK_INDICATOR_BASE_RIGHT },
    ],

    [
      'overflow right',
      { top: 0, right: 800 },
      { top: 100, right: 820 },
      { top: 100 + TK_INDICATOR_TOP_OFFSET, right: TK_INDICATOR_BASE_RIGHT - 20 },
    ],

    [
      'flush right edge',
      { top: 0, right: 800 },
      { top: 100, right: 800 },
      { top: 100 + TK_INDICATOR_TOP_OFFSET, right: TK_INDICATOR_BASE_RIGHT },
    ],

    [
      'negative relative top',
      { top: 120, right: 800 },
      { top: 100, right: 500 },
      { top: -16, right: TK_INDICATOR_BASE_RIGHT },
    ],

    ['null rects fallback', null, null, { top: 0, right: TK_INDICATOR_BASE_RIGHT }],
  ]

  it.each(POSITION_CASES)('%s', (_name, rootRect, positioningRect, expected) => {
    expect(resolveTkIndicatorPosition(rootRect, positioningRect)).toEqual(expected)
  })
})

describe('nextTkNodeKey', () => {
  const CYCLE_CASES: Array<[string, readonly string[], string | null, string | undefined]> = [
    ['first selects the next node', ['a', 'b', 'c'], 'a', 'b'],
    ['middle selects the next node', ['a', 'b', 'c'], 'b', 'c'],
    ['last wraps to the first node', ['a', 'b', 'c'], 'c', 'a'],
    ['no current key selects the first node', ['a', 'b', 'c'], null, 'a'],
    ['single node cycles onto itself', ['a'], 'a', 'a'],
    ['unknown current key selects the first node', ['a', 'b'], 'zzz', 'a'],
    ['empty node list yields nothing', [], null, undefined],
  ]

  it.each(CYCLE_CASES)('%s', (_name, nodeKeys, currentKey, expected) => {
    expect(nextTkNodeKey(nodeKeys, currentKey)).toBe(expected)
  })
})
