import type { Dim } from '@kobato/font-split/scripts/corpus/clean'

import {
  CORPUS_ID,
  DUMP_URL,
  FIXTURE_ID_MOD,
  FIXTURE_ID_REM,
  FIXTURE_MIN_CHARS,
  FIXTURE_PAGE_COUNT,
} from '@kobato/font-split/scripts/corpus/profile'

export interface Candidate {
  id: number
  hans: string
  hant: string
}

const CHAR_DF_CUT = 2

const SOURCE_NOTE = 'Wikimedia dump, article text CC BY-SA 4.0; frequency counts and codepoint sets are factual data'
const PIPELINE_NOTE = 'ns0 non-redirect pages, wikitext-cleaned, OpenCC-converted; per-document distinct counts'
const GENERATOR_NOTE = 'pnpm --filter @kobato/font-split run corpus:build (tools/font-split/scripts/corpus)'

const DIM_LABEL: Record<Dim, string> = { hans: 'zh-hans (OpenCC t2s)', hant: 'zh-hant (OpenCC s2t)' }
const DIM_STEP: Record<Dim, string> = { hans: 't2s', hant: 's2t' }

const hex = (codepoint: number): string => codepoint.toString(16).toUpperCase()

export const keptCodepoints = (map: ReadonlyMap<number, number>): number =>
  [...map.values()].filter((df) => df >= CHAR_DF_CUT).length

export function charFreqTsv(dim: Dim, docs: number, map: ReadonlyMap<number, number>): string {
  const codepoints = [...map.keys()].sort((left, right) => left - right)
  let kept = 0
  let body = ''
  for (const codepoint of codepoints) {
    const df = map.get(codepoint) ?? 0
    if (df >= CHAR_DF_CUT) {
      body += `${hex(codepoint)}\t${df}\n`
      kept += 1
    }
  }
  return [
    `# Character document frequencies for Kobato font slicing (dimension: ${DIM_LABEL[dim]}).`,
    `# Source: ${DUMP_URL} (${SOURCE_NOTE})`,
    `# Generator: ${GENERATOR_NOTE}`,
    `# Pipeline: ${PIPELINE_NOTE} ${DIM_STEP[dim]}; fixture pages (page_id % ${FIXTURE_ID_MOD} == ${FIXTURE_ID_REM}) excluded`,
    `# Documents: ${docs}`,
    `# Cut: df >= ${CHAR_DF_CUT} (${kept} of ${codepoints.length} codepoints kept)`,
    body,
  ].join('\n')
}

export function pageFixture(dim: Dim, pages: readonly Candidate[]): string {
  let body = ''
  for (const page of pages) {
    const text = dim === 'hans' ? page.hans : page.hant
    const codepoints = Array.from(new Set(Array.from(text, (c) => c.codePointAt(0)!)))
    codepoints.sort((left, right) => left - right)
    body += `${codepoints.map(hex).join(',')}\n`
  }
  return [
    '# Held-out page fixture for the page-cost baseline harness (tests/page_cost.rs).',
    `# ${FIXTURE_PAGE_COUNT} pages of ${DIM_LABEL[dim]} text, one per line: sorted comma-separated hex codepoints`,
    "# (the page's distinct characters). Lines starting with '#' are ignored.",
    `# Source: ${CORPUS_ID}-pages-articles-multistream.xml.bz2 (${SOURCE_NOTE})`,
    `# Generator: ${GENERATOR_NOTE}: ns0 non-redirect pages with`,
    `#   page_id % ${FIXTURE_ID_MOD} == ${FIXTURE_ID_REM}, wikitext-cleaned + OpenCC ${DIM_STEP[dim]},`,
    `#   first ${FIXTURE_PAGE_COUNT} with >= ${FIXTURE_MIN_CHARS} cleaned chars.`,
    body,
  ].join('\n')
}
