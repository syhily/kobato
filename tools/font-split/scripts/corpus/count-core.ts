import type { Candidate } from '@kobato/font-split/scripts/corpus/emit'

import { cleanWikitext } from '@kobato/font-split/scripts/corpus/clean'
import { pageText, type PageBytes } from '@kobato/font-split/scripts/corpus/dump'
import {
  FIXTURE_ID_MOD,
  FIXTURE_MIN_CHARS,
  FIXTURE_PAGE_COUNT,
  FIXTURE_ID_REM,
} from '@kobato/font-split/scripts/corpus/profile'

export interface Converters {
  hans: (text: string) => string
  hant: (text: string) => string
}

export interface BatchResult {
  docs: number
  hans: number[]
  hant: number[]
  candidates: Candidate[]
}

export interface WirePage {
  id: number
  ns: number
  redirect: boolean
  bytes: ArrayBuffer
}

export interface BatchMessage {
  pages: WirePage[]
}

export interface WireResult extends Omit<BatchResult, 'hans' | 'hant'> {
  hans: Uint32Array<ArrayBuffer>
  hant: Uint32Array<ArrayBuffer>
}

function countDocuments(text: string, df: Map<number, number>): void {
  const seen = new Set<number>()
  for (const c of text) {
    seen.add(c.codePointAt(0)!)
  }
  for (const codepoint of seen) {
    df.set(codepoint, (df.get(codepoint) ?? 0) + 1)
  }
}

function flatten(df: ReadonlyMap<number, number>): number[] {
  const flat: number[] = []
  for (const [codepoint, count] of df) {
    flat.push(codepoint, count)
  }
  return flat
}

export function processPages(pages: readonly PageBytes[], converters: Converters): BatchResult {
  const hansDf = new Map<number, number>()
  const hantDf = new Map<number, number>()
  const candidates: Candidate[] = []
  let docs = 0
  for (const page of pages) {
    if (page.ns !== 0 || page.redirect) {
      continue
    }
    const text = pageText(page.bytes)
    const hans = converters.hans(cleanWikitext(text, 'hans'))
    const hant = converters.hant(cleanWikitext(text, 'hant'))
    if (page.id % FIXTURE_ID_MOD === FIXTURE_ID_REM) {
      candidates.push({ id: page.id, hans, hant })
      continue
    }
    docs += 1
    countDocuments(hans, hansDf)
    countDocuments(hant, hantDf)
  }
  return { docs, hans: flatten(hansDf), hant: flatten(hantDf), candidates }
}

export function mergeInto(df: Map<number, number>, flat: ArrayLike<number>): void {
  for (let at = 0; at + 1 < flat.length; at += 2) {
    const codepoint = flat[at]!
    df.set(codepoint, (df.get(codepoint) ?? 0) + flat[at + 1]!)
  }
}

export function selectFixtures(candidates: readonly Candidate[]): Candidate[] {
  const sorted = [...candidates].sort((left, right) => left.id - right.id)
  const longEnough = sorted.filter((candidate) => Array.from(candidate.hans).length >= FIXTURE_MIN_CHARS)
  const selected = longEnough.slice(0, FIXTURE_PAGE_COUNT)
  if (selected.length !== FIXTURE_PAGE_COUNT) {
    throw new Error(
      `only ${selected.length} fixture candidates with >= ${FIXTURE_MIN_CHARS} chars (from ${sorted.length} id-matches) — tune FIXTURE_ID_MOD/FIXTURE_MIN_CHARS`,
    )
  }
  return selected
}
