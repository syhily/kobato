import { parseUnsigned, trimWhiteSpace } from '@kobato/font-split/scripts/corpus/clean'
import { CORPUS_ID, tableDir, tablesFile } from '@kobato/font-split/scripts/corpus/profile'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

interface FreqTable {
  df: Map<number, number>
  docs: number
}

export interface Pack {
  name: string
  chars: number[]
  df: number[]
}

export interface Tables {
  rust: string
  packs: Pack[]
  docs: number
}

const NON_PRINTABLE = /\p{Grapheme_Extend}|\p{Cc}|\p{Cf}|\p{Cs}|\p{Co}|\p{Cn}|\p{Zl}|\p{Zp}|\p{Zs}/u

function readLines(file: string): string[] {
  return readFileSync(join(tableDir, file), 'utf8')
    .split('\n')
    .map((line) => trimWhiteSpace(line))
    .filter((line) => line !== '' && !line.startsWith('#'))
}

export function readTable(file: string): number[] {
  return readLines(file)
    .filter((line) => !line.endsWith('※'))
    .map((line) => line.codePointAt(0)!)
}

function readFreq(file: string): FreqTable {
  const df = new Map<number, number>()
  let docs = 0
  for (const line of readFileSync(join(tableDir, file), 'utf8').split('\n')) {
    if (line.startsWith('# Documents: ')) {
      const parsed = parseUnsigned(trimWhiteSpace(line.slice('# Documents: '.length)), 10)
      if (parsed === null) {
        throw new Error(`${file}: "Documents:" header is not a number`)
      }
      docs = parsed
      continue
    }
    if (line.startsWith('#')) {
      continue
    }
    const tab = line.indexOf('\t')
    if (tab === -1) {
      continue
    }
    const codepoint = parseUnsigned(line.slice(0, tab), 16)
    const count = parseUnsigned(line.slice(tab + 1), 10)
    if (codepoint === null || count === null) {
      throw new Error(`${file}: malformed frequency line: ${line}`)
    }
    df.set(codepoint, count)
  }
  if (!(docs > 0 && df.size > 0)) {
    throw new Error(
      `${file}: missing "# Documents:" header or empty — regenerate with \`pnpm --filter @kobato/font-split run corpus:build\``,
    )
  }
  return { df, docs }
}

function pack(name: string, chars: number[], freq: FreqTable | null): Pack {
  const entries = chars.map((codepoint, index) => ({
    codepoint,
    df: freq?.df.get(codepoint) ?? 0,
    index,
  }))
  if (freq !== null) {
    entries.sort((left, right) => right.df - left.df || left.index - right.index)
  }
  return { name, chars: entries.map((entry) => entry.codepoint), df: entries.map((entry) => entry.df) }
}

function dedupe(chars: number[]): number[] {
  const seen = new Set<number>()
  return chars.filter((codepoint) => {
    if (seen.has(codepoint)) {
      return false
    }
    seen.add(codepoint)
    return true
  })
}

function textOf(chars: readonly number[]): string {
  let out = ''
  for (const codepoint of chars) {
    out += String.fromCodePoint(codepoint)
  }
  return out
}

export function rustStringLiteral(s: string): string {
  let out = '"'
  for (const c of s) {
    if (c === '\0') {
      out += '\\0'
    } else if (c === '"') {
      out += '\\"'
    } else if (c === '\\') {
      out += '\\\\'
    } else if (c === '\n') {
      out += '\\n'
    } else if (c === '\r') {
      out += '\\r'
    } else if (c === '\t') {
      out += '\\t'
    } else if (c !== ' ' && NON_PRINTABLE.test(c)) {
      out += `\\u{${c.codePointAt(0)!.toString(16)}}`
    } else {
      out += c
    }
  }
  return `${out}"`
}

function render(table: Pack, withDf: boolean): string {
  const literal = `#[rustfmt::skip]\npub(crate) const ${table.name}: &str = ${rustStringLiteral(textOf(table.chars))};\n`
  return withDf
    ? `${literal}#[rustfmt::skip]\npub const ${table.name}_DF: &[u32] = &[${table.df.join(',')}];\n`
    : literal
}

export function assembleTables(): Tables {
  const freqBasename = `freq-${CORPUS_ID}`
  const hans = readFreq(`${freqBasename}-hans.tsv`)
  const hant = readFreq(`${freqBasename}-hant.tsv`)
  if (hans.docs !== hant.docs) {
    throw new Error(`hans/hant document counts differ (${hans.docs} vs ${hant.docs}) — regenerate both together`)
  }

  const tghL1 = pack('ZH_TGH_L1', dedupe(readTable('tgh-2013-level-1.txt')), hans)
  const tghL2 = pack('ZH_TGH_L2', dedupe(readTable('tgh-2013-level-2.txt')), hans)
  const tghL3 = pack('ZH_TGH_L3', dedupe(readTable('tgh-2013-level-3.txt')), hans)
  const tghAll = new Set([...tghL1.chars, ...tghL2.chars, ...tghL3.chars])

  const zhHkChars = dedupe(readTable('hk-common-4762.txt')).filter((codepoint) => !tghAll.has(codepoint))
  const zhHk = pack('ZH_HK', zhHkChars, hant)
  const zhHkSet = new Set(zhHkChars)

  const zhTwChars = dedupe([...readTable('tw-common-4808.txt'), ...readTable('tw-less-common-6329.txt')]).filter(
    (codepoint) => !tghAll.has(codepoint) && !zhHkSet.has(codepoint),
  )
  const zhTw = pack('ZH_TW', zhTwChars, hant)
  const zhTwSet = new Set(zhTwChars)

  const zhJa = pack(
    'ZH_JA',
    dedupe(readTable('ja-joyo-2136.txt')).filter(
      (codepoint) => !tghAll.has(codepoint) && !zhHkSet.has(codepoint) && !zhTwSet.has(codepoint),
    ),
    hans,
  )
  const hangulSyl = pack('HANGUL_SYL', dedupe(readTable('ko-syllables-2026.txt')), null)

  const sizes: ReadonlyArray<readonly [string, number, number]> = [
    ['ZH_TGH_L1', tghL1.chars.length, 3500],
    ['ZH_TGH_L2', tghL2.chars.length, 3000],
    ['ZH_TGH_L3', tghL3.chars.length, 1605],
    ['ZH_JA raw', dedupe(readTable('ja-joyo-2136.txt')).length, 2136],
    ['ZH_TW less-common raw', readTable('tw-less-common-6329.txt').length, 6329],
    ['HANGUL_SYL', hangulSyl.chars.length, 2026],
  ]
  for (const [name, actual, want] of sizes) {
    if (actual !== want) {
      throw new Error(`${name}: expected ${want} chars, got ${actual} — vendored source data drifted`)
    }
  }

  const packs = [tghL1, tghL2, tghL3, zhHk, zhTw, zhJa, hangulSyl]
  return {
    packs,
    docs: hans.docs,
    rust: [
      `pub const FREQ_CORPUS_DOCS: u32 = ${hans.docs};\n\n`,
      ...packs.map((table) => render(table, table !== hangulSyl)),
    ].join(''),
  }
}

export function writeTables(): string {
  const { rust, packs, docs } = assembleTables()
  writeFileSync(tablesFile, rust)
  const size = (name: string): number => packs.find((table) => table.name === name)?.chars.length ?? 0
  const covered = (name: string): string => {
    const df = packs.find((table) => table.name === name)?.df ?? []
    return ((df.filter((value) => value > 0).length / df.length) * 100).toFixed(1)
  }
  console.log(
    `wrote ${tablesFile}\n  ZH_TGH_L1=${size('ZH_TGH_L1')} ZH_TGH_L2=${size('ZH_TGH_L2')} ZH_TGH_L3=${size('ZH_TGH_L3')}` +
      `\n  ZH_HK=${size('ZH_HK')} ZH_TW=${size('ZH_TW')} ZH_JA=${size('ZH_JA')} HANGUL_SYL=${size('HANGUL_SYL')}` +
      `\n  corpus docs=${docs}; freq coverage: L1 ${covered('ZH_TGH_L1')}% L2 ${covered('ZH_TGH_L2')}% L3 ${covered('ZH_TGH_L3')}%` +
      ` HK ${covered('ZH_HK')}% TW ${covered('ZH_TW')}% JA ${covered('ZH_JA')}%`,
  )
  return rust
}
