import { charFreqTsv, keptCodepoints, pageFixture } from '@kobato/font-split/scripts/corpus/emit'
import {
  DUMP_URL,
  FIXTURE_ID_MOD,
  FIXTURE_ID_REM,
  FIXTURE_MIN_CHARS,
  FIXTURE_PAGE_COUNT,
} from '@kobato/font-split/scripts/corpus/profile'
import { describe, expect, it } from 'vitest'

describe('charFreqTsv', () => {
  const df = new Map([
    [0x4e2d, 1],
    [0x20, 5],
    [0x1f600, 3],
    [0x41, 2],
  ])

  it('writes the codepoints above the cut in ascending order under the provenance header', () => {
    const lines = charFreqTsv('hans', 100, df).split('\n')
    expect(lines.slice(0, 6)).toEqual([
      '# Character document frequencies for Kobato font slicing (dimension: zh-hans (OpenCC t2s)).',
      `# Source: ${DUMP_URL} (Wikimedia dump, article text CC BY-SA 4.0; frequency counts and codepoint sets are factual data)`,
      '# Generator: pnpm --filter @kobato/font-split run corpus:build (tools/font-split/scripts/corpus)',
      `# Pipeline: ns0 non-redirect pages, wikitext-cleaned, OpenCC-converted; per-document distinct counts t2s; fixture pages (page_id % ${FIXTURE_ID_MOD} == ${FIXTURE_ID_REM}) excluded`,
      '# Documents: 100',
      '# Cut: df >= 2 (3 of 4 codepoints kept)',
    ])
    expect(lines.slice(6)).toEqual(['20\t5', '41\t2', '1F600\t3', ''])
    expect(keptCodepoints(df)).toBe(3)
  })

  it('names the other dimension', () => {
    expect(charFreqTsv('hant', 1, df).split('\n')[0]).toBe(
      '# Character document frequencies for Kobato font slicing (dimension: zh-hant (OpenCC s2t)).',
    )
  })
})

describe('pageFixture', () => {
  it('writes one sorted, distinct codepoint set per page', () => {
    const content = pageFixture('hant', [
      { id: 9, hans: '乙甲', hant: '乙丁甲乙' },
      { id: 10, hans: 'a', hant: 'a a' },
    ])
    const lines = content.split('\n')
    expect(lines[1]).toBe(
      `# ${FIXTURE_PAGE_COUNT} pages of zh-hant (OpenCC s2t) text, one per line: sorted comma-separated hex codepoints`,
    )
    expect(lines[6]).toBe(`#   first ${FIXTURE_PAGE_COUNT} with >= ${FIXTURE_MIN_CHARS} cleaned chars.`)
    expect(lines.slice(7)).toEqual(['4E01,4E59,7532', '20,61', ''])
  })
})
