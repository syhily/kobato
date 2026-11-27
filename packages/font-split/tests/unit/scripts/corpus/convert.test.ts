import { opencc } from '@kobato/font-split/scripts/corpus/convert'
import { tableDir } from '@kobato/font-split/scripts/corpus/profile'
import { OPENCC_REFERENCE } from '@kobato/font-split/tests/unit/scripts/corpus/opencc-reference'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('opencc', () => {
  it('converts like opencc-fmmseg 0.13.1 on the recorded reference inputs', () => {
    const { hans, hant } = opencc()
    const mismatches = OPENCC_REFERENCE.filter(
      ([text, simplified, traditional]) => hans.convert(text) !== simplified || hant.convert(text) !== traditional,
    )
    expect(mismatches).toEqual([])
  })

  it('resolves one-to-many entries by context', () => {
    const { hans, hant } = opencc()
    expect(hans.convert('頭髮剪髮出發麵包著作著名着着乾淨乾燥乾坤')).toBe('头发剪发出发面包著作著名着着干净干燥乾坤')
    expect(hant.convert('头发剪发出发面包着着干净干燥乾坤皇帝')).toBe('頭髮剪髮出發麵包著著乾淨乾燥乾坤皇帝')
    expect(hant.convert('为了为了里面众人')).toBe('為了為了裡面眾人')
    expect(hant.convert('㐹㑇')).toBe('㑶㑳')
  })

  it('never matches across a delimiter and keeps unknown characters', () => {
    const { hans } = opencc()
    expect(hans.convert('簡 體,字。簡\t體\n簡｟體')).toBe('简 体,字。简\t体\n简｟体')
    expect(hans.convert('𠮷𠇹家')).toBe('𠮷𠇹家')
  })

  it('reads the vendored dictionaries the way the Rust crate does', () => {
    const stCharacters = readFileSync(join(tableDir, 'opencc', 'STCharacters.txt'), 'utf8')
    const tsCharacters = readFileSync(join(tableDir, 'opencc', 'TSCharacters.txt'), 'utf8')
    expect(stCharacters).toContain('\n为\t為 爲\n')
    expect(stCharacters).toContain('\n并\t並 併 幷\n')
    expect(tsCharacters).toContain('\n# 幷\t幷 并\n')
    const { hans, hant } = opencc()
    expect(hant.convert('为并')).toBe('為並')
    expect(hans.convert('幷')).toBe('幷')
  })

  it('converts inside ideographic description sequences like the Rust crate', () => {
    const { hans, hant } = opencc()
    expect(hans.convert('⿰繁體 ⿸胜利 ⿻面 ⿰体')).toBe('⿰繁体 ⿸胜利 ⿻面 ⿰体')
    expect(hant.convert('⿰繁體 ⿸胜利 ⿻面 ⿰体')).toBe('⿰繁體 ⿸勝利 ⿻面 ⿰體')
    expect(hans.convert('⿰⿰繁體 ⿳簡體字')).toBe('⿰⿰繁体 ⿳简体字')
  })
})
