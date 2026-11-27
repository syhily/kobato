import { assembleTables, readTable, rustStringLiteral } from '@kobato/font-split/scripts/corpus/generate'
import { tablesFile } from '@kobato/font-split/scripts/corpus/profile'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('assembleTables', () => {
  it('reproduces the committed tables byte for byte', () => {
    const { rust, packs, docs } = assembleTables()
    expect(rust).toBe(readFileSync(tablesFile, 'utf8'))
    expect(docs).toBe(1563100)
    expect(packs.map((pack) => [pack.name, pack.chars.length, pack.df.length])).toEqual([
      ['ZH_TGH_L1', 3500, 3500],
      ['ZH_TGH_L2', 3000, 3000],
      ['ZH_TGH_L3', 1605, 1605],
      ['ZH_HK', 1709, 1709],
      ['ZH_TW', 4551, 4551],
      ['ZH_JA', 231, 231],
      ['HANGUL_SYL', 2026, 2026],
    ])
  })

  it('orders every frequency pack by document frequency and keeps the regional packs disjoint', () => {
    const [tghL1, tghL2, tghL3, zhHk, zhTw, zhJa] = assembleTables().packs
    for (const pack of [tghL1!, tghL2!, tghL3!, zhHk!, zhTw!, zhJa!]) {
      expect(
        [...pack.df].sort((left, right) => right - left),
        pack.name,
      ).toEqual(pack.df)
    }
    const earlier = new Set([...tghL1!.chars, ...tghL2!.chars, ...tghL3!.chars])
    expect(zhHk!.chars.some((codepoint) => earlier.has(codepoint))).toBe(false)
    earlier.clear()
    for (const codepoint of zhHk!.chars) {
      earlier.add(codepoint)
    }
    expect(zhTw!.chars.some((codepoint) => earlier.has(codepoint))).toBe(false)
  })
})

describe('readTable', () => {
  it('takes the first code point of every line but the removed ones', () => {
    expect(readTable('tw-less-common-6329.txt')).toHaveLength(6329)
    expect(readTable('ja-joyo-2136.txt')).toHaveLength(2136)
    expect(new Set(readTable('ko-syllables-2026.txt')).size).toBe(2026)
  })
})

describe('rustStringLiteral', () => {
  it.each([
    ['a\0b\u{a0}c\u{301}d\u{10ffff}', String.raw`"a\0b\u{a0}c\u{301}d\u{10ffff}"`],
    ['"\\\'\n\r\t\u{7f}\u{9f}', String.raw`"\"\\'\n\r\t\u{7f}\u{9f}"`],
    [
      '中 \u{200b}\ufeff\u{ad}\u{2028}\u{3000}\u{e000}',
      String.raw`"中 \u{200b}\u{feff}\u{ad}\u{2028}\u{3000}\u{e000}"`,
    ],
    [
      '\u{1f600}\u{378}\u{ffff}\u{fffe}\u{10fffe}\u{d7ff}\u{e000}\u{f8ff}',
      String.raw`"😀\u{378}\u{ffff}\u{fffe}\u{10fffe}\u{d7ff}\u{e000}\u{f8ff}"`,
    ],
    ['plain 中', '"plain 中"'],
  ])('escapes %j like the Debug formatter of a Rust string', (text, expected) => {
    expect(rustStringLiteral(text)).toBe(expected)
  })
})
