import { mergeInto, processPages, selectFixtures } from '@kobato/font-split/scripts/corpus/count-core'
import { FIXTURE_ID_MOD, FIXTURE_MIN_CHARS, FIXTURE_PAGE_COUNT } from '@kobato/font-split/scripts/corpus/profile'
import { describe, expect, it } from 'vitest'

const identity = (text: string): string => text
const converters = { hans: identity, hant: identity }
const page = (id: number, ns: number, redirect: boolean, text: string) => ({
  id,
  ns,
  redirect,
  bytes: new TextEncoder().encode(`标题\n${text}`),
})
const pairs = (flat: readonly number[]): Array<[number, number]> => {
  const out: Array<[number, number]> = []
  for (let at = 0; at + 1 < flat.length; at += 2) {
    out.push([flat[at]!, flat[at + 1]!])
  }
  return out.sort((left, right) => left[0] - right[0])
}

describe('processPages', () => {
  it('counts each character once per main-namespace article and holds the fixture pages back', () => {
    const candidate = FIXTURE_ID_MOD * 2 + 7
    const result = processPages(
      [
        page(1, 0, false, '甲甲乙'),
        page(2, 1, false, '丙'),
        page(3, 0, true, '丁'),
        page(candidate, 0, false, '戊己庚'),
        page(4, 0, false, "'''甲''' [[x|辛]]"),
      ],
      converters,
    )
    expect(result.docs).toBe(2)
    expect(pairs(result.hans)).toEqual(pairs(result.hant))
    expect(pairs(result.hans)).toEqual([
      [0x20, 2],
      [0x4e59, 1],
      [0x6807, 2],
      [0x7532, 2],
      [0x8f9b, 1],
      [0x9898, 2],
    ])
    expect(result.candidates.map((entry) => [entry.id, entry.hans, entry.hant])).toEqual([
      [candidate, '标题 戊己庚', '标题 戊己庚'],
    ])
  })
})

describe('mergeInto', () => {
  it('adds batch counts into the accumulator', () => {
    const df = new Map([[0x7532, 2]])
    mergeInto(df, [0x7532, 3, 0x4e59, 1])
    mergeInto(df, [0x4e59, 4])
    expect([...df]).toEqual([
      [0x7532, 5],
      [0x4e59, 5],
    ])
  })
})

describe('selectFixtures', () => {
  const candidate = (id: number, length: number) => ({ id, hans: '甲'.repeat(length), hant: '乙'.repeat(length) })

  it('sorts by page id, keeps the long pages and takes the first sixty-four', () => {
    const long = Array.from({ length: 80 }, (_, index) => candidate(1000 - index, FIXTURE_MIN_CHARS + index))
    const selected = selectFixtures(
      [candidate(30, FIXTURE_MIN_CHARS), candidate(10, FIXTURE_MIN_CHARS - 1)].concat(long),
    )
    expect(selected).toHaveLength(FIXTURE_PAGE_COUNT)
    expect(selected[0]?.id).toBe(30)
    expect(selected.at(-1)?.id).toBe(983)
    const ids = selected.map((entry) => entry.id)
    expect(ids).toEqual([...ids].sort((left, right) => left - right))
  })

  it('refuses to write a smaller fixture', () => {
    expect(() => selectFixtures([candidate(7, FIXTURE_MIN_CHARS), candidate(9, 5)])).toThrow(
      /only 1 fixture candidates with >= 1200 chars \(from 2 id-matches\) — tune FIXTURE_ID_MOD\/FIXTURE_MIN_CHARS/,
    )
  })
})
