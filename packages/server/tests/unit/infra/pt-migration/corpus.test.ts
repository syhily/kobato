import type { PtRowOutcome } from '@kobato/server/infra/pt-migration/core'
import type { LexicalBody } from '@kobato/shared/lexical/schema'

import { lexicalBodyToHtml } from '@kobato/editor/lexical-html/lexicalBodyToHtml'
import { processPtRow } from '@kobato/server/infra/pt-migration/core'
import { verifyBodySanity } from '@kobato/server/infra/pt-migration/migrate'
import { parseLexicalCommentBody } from '@kobato/shared/lexical/comment-schema'
import { parseLexicalBody } from '@kobato/shared/lexical/schema'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import type { PtCorpusFixtureEntry } from '../../../fixtures/pt-corpus'

import { PT_CORPUS } from '../../../fixtures/pt-corpus'

// Corpus test: every historical PT shape extracted from the pre-split
// test fixtures must convert through the migration pipeline, pass the
// read-path gate, survive SSR spot-rendering, and satisfy the verify
// sanity assertions. Corrupt/unknown shapes must fail with a
// reasonable error. This is the machine guarantee that no historical
// format is left behind by the PT→Lexical migration.

const FIXTURE_DIR = resolve(process.cwd(), 'packages/server/tests/fixtures/pt-corpus')

interface PtCorpusFixture {
  kind: 'content' | 'comment'
  note: string
  bodyJson: string
}

function loadFixture(entry: PtCorpusFixtureEntry): PtCorpusFixture {
  const parsed = JSON.parse(readFileSync(resolve(FIXTURE_DIR, entry.path), 'utf-8')) as PtCorpusFixture
  expect(parsed.kind, `${entry.path} kind mismatch`).toBe(entry.kind)
  return parsed
}

/** Narrow `outcome` to the migrated variant (vitest's `expect` is not a type guard). */
function expectMigrated(outcome: PtRowOutcome): asserts outcome is Extract<PtRowOutcome, { status: 'migrated' }> {
  expect(outcome.status).toBe('migrated')
}

/** Narrow `outcome` to the error variant. */
function expectError(outcome: PtRowOutcome): asserts outcome is Extract<PtRowOutcome, { status: 'error' }> {
  expect(outcome.status).toBe('error')
}

/** Fixtures that are EXPECTED to fail the pipeline (error classification, not crashes). */
const EXPECTED_ERROR_FIXTURES = new Set(['corrupt-json.json', 'unknown-type.json', 'comment-violation.json'])

/** Fixture whose whole point is a dangling footnote targetKey (converts, sanity flags it). */
const ORPHAN_FOOTNOTE_FIXTURE = 'footnote-orphan.json'

function migratedContentBody(bodyJson: string): LexicalBody {
  const outcome = processPtRow('content', 1, bodyJson)
  expectMigrated(outcome)
  return parseLexicalBody(JSON.parse(outcome.converted) as unknown)
}

describe('PT→Lexical corpus — every historical shape converts', () => {
  it('the manifest covers at least 12 distinct historical shapes across both kinds', () => {
    expect(PT_CORPUS.length).toBeGreaterThanOrEqual(12)
    expect(new Set(PT_CORPUS.map((entry) => entry.kind)).has('content')).toBe(true)
    expect(new Set(PT_CORPUS.map((entry) => entry.kind)).has('comment')).toBe(true)
    const paths = new Set(PT_CORPUS.map((entry) => entry.path))
    expect(paths.size).toBe(PT_CORPUS.length)
  })

  it('every manifest entry loads and round-trips its bodyJson envelope', () => {
    for (const entry of PT_CORPUS) {
      const fixture = loadFixture(entry)
      if (entry.path !== 'corrupt-json.json') {
        expect(Array.isArray(JSON.parse(fixture.bodyJson)), `${entry.path} must hold a JSON array`).toBe(true)
      }
      expect(JSON.parse(JSON.stringify(fixture))).toEqual(fixture)
    }
  })

  for (const entry of PT_CORPUS) {
    it(`converts ${entry.path} (${entry.note})`, () => {
      const fixture = loadFixture(entry)
      const outcome = processPtRow(entry.kind, 1, fixture.bodyJson)

      if (EXPECTED_ERROR_FIXTURES.has(entry.path)) {
        // Expected-failure fixtures: the error must be classified, not thrown.
        expectError(outcome)
        expect(outcome.error).toBeTruthy()
        if (entry.path === 'corrupt-json.json') {
          expect(outcome.error).toBe('invalid-json')
        }
        return
      }

      expectMigrated(outcome)
      const converted = JSON.parse(outcome.converted) as unknown

      if (entry.kind === 'comment') {
        const body = parseLexicalCommentBody(converted)
        expect(body.root.children.length).toBeGreaterThan(0)
        // The comment sanity assertions hold (no footnoteRefs, no deep lists).
        expect(verifyBodySanity(body, 'comment')).toEqual([])
      } else {
        const body = parseLexicalBody(converted)
        // The converted body survives the string renderer with non-empty output.
        const rendered = lexicalBodyToHtml(body, { headingSlugs: [], mode: 'default', footnotesSectionTitle: '注' })
        expect(rendered.length).toBeGreaterThan(0)
        // The content sanity assertions hold — except the orphan-footnote
        // fixture, whose whole point is a dangling targetKey.
        if (entry.path === ORPHAN_FOOTNOTE_FIXTURE) {
          expect(verifyBodySanity(body, 'content')).not.toEqual([])
        } else {
          expect(verifyBodySanity(body, 'content')).toEqual([])
        }
      }

      // The converted body re-runs through the pipeline as skipped — the
      // idempotence invariant.
      const rerun = processPtRow(entry.kind, 1, outcome.converted)
      expect(rerun.status).toBe('skipped-lexical')
    })
  }
})

describe('PT→Lexical corpus — key-field preservation', () => {
  const fixture = (name: string): PtCorpusFixture => loadFixture(PT_CORPUS.find((entry) => entry.path === name)!)

  it('keeps ptKey / table headerState / twoColumn panes on the rich body', () => {
    const json = JSON.stringify(migratedContentBody(fixture('rich-body.json').bodyJson))
    // Custom nodes carry their ptKey through the mapping.
    expect(json).toContain('"ptKey":"')
    // Table headerState survives (bitmask 1/2/3).
    expect(json).toMatch(/"headerState":(1|2|3)/)
    // Both twoColumn panes are present.
    expect(json).toContain('"side":"left"')
    expect(json).toContain('"side":"right"')
  })

  it('keeps footnoteRef targetKey + index and the definition on cited footnotes', () => {
    const body = migratedContentBody(fixture('footnote-cited.json').bodyJson)
    const json = JSON.stringify(body)
    expect(json).toContain('"footnoteRef"')
    expect(json).toContain('"footnoteDefinition"')
    expect(json).toContain('"targetKey":"')
    expect(verifyBodySanity(body, 'content')).toEqual([])
  })

  it('migrates the orphan footnote but the sanity assertion flags its targetKey', () => {
    const body = migratedContentBody(fixture('footnote-orphan.json').bodyJson)
    const failures = verifyBodySanity(body, 'content')
    expect(failures.some((message) => message.includes('footnoteRef targetKey'))).toBe(true)
  })

  it('keeps image caption/layout when present and stays minimal otherwise', () => {
    const minimal = JSON.stringify(migratedContentBody(fixture('image-minimal.json').bodyJson))
    expect(minimal).not.toContain('"caption"')
    const withCaption = JSON.stringify(migratedContentBody(fixture('image-caption-layout.json').bodyJson))
    expect(withCaption).toContain('"caption"')
    expect(withCaption).toMatch(/"layout":"(left|center|right)"/)
  })

  it('keeps math tex and mathml payloads', () => {
    const inline = JSON.stringify(migratedContentBody(fixture('math-inline-mathml.json').bodyJson))
    expect(inline).toContain('"mathInline"')
    expect(inline).toContain('"tex"')
    expect(inline).toContain('"mathml"')
    const block = JSON.stringify(migratedContentBody(fixture('math-block-tex.json').bodyJson))
    expect(block).toContain('"mathBlock"')
    expect(block).toContain('"tex"')
  })

  it('keeps the table header row + mixed isHeader cells', () => {
    const json = JSON.stringify(migratedContentBody(fixture('table-header-mixed.json').bodyJson))
    expect(json).toContain('"table"')
    // A header row (bit 1) or header cell (bit 2) must survive.
    expect(json).toMatch(/"headerState":(1|2|3)/)
  })

  it('keeps solution and both twoColumn panes', () => {
    const json = JSON.stringify(migratedContentBody(fixture('solution-two-column.json').bodyJson))
    expect(json).toContain('"solution"')
    expect(json).toContain('"twoColumn"')
    expect(json).toContain('"side":"left"')
    expect(json).toContain('"side":"right"')
  })

  it('nests skipped/mixed list levels into a valid list tree', () => {
    const body = migratedContentBody(fixture('list-level-skips.json').bodyJson)
    expect(JSON.stringify(body)).toContain('"list"')
    expect(verifyBodySanity(body, 'content')).toEqual([])
  })

  it('keeps the comment subset gated and sane', () => {
    const outcome = processPtRow('comment', 1, fixture('comment-subset.json').bodyJson)
    expectMigrated(outcome)
    const body = parseLexicalCommentBody(JSON.parse(outcome.converted) as unknown)
    expect(body.root.children.length).toBeGreaterThan(0)
    expect(verifyBodySanity(body, 'comment')).toEqual([])
  })

  it('keeps the span text when a markDef reference is missing', () => {
    const source = JSON.parse(fixture('markdef-missing.json').bodyJson) as Array<{
      _type: string
      children?: Array<{ _type: string; text?: string }>
    }>
    const sourceTexts = source.flatMap((block) =>
      block._type === 'block' ? (block.children ?? []).map((span) => span.text ?? '') : [],
    )
    expect(sourceTexts.length).toBeGreaterThan(0)
    const json = JSON.stringify(migratedContentBody(fixture('markdef-missing.json').bodyJson))
    for (const text of sourceTexts) {
      if (text !== '') {
        expect(json).toContain(text)
      }
    }
  })
})
