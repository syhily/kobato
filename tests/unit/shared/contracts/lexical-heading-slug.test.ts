import type { SerializedEditorState } from '@inkling/editor/headless'

import { lexicalStateToHtml } from '@inkling/editor/headless'
import { describe, expect, it } from 'vitest'

import { lexicalBodyWith, lexicalHeading } from '#/_helpers/lexical'
import { collectLexicalHeadings } from '@/shared/lexical/collect'
import { createHeadingSlugTracker, slugifyHeadingText } from '@/shared/lexical/heading-slug'

// Contract test (plan docs/plans/inkling-editor-replacement.md, R3
// consistency obligation): the `headings` derived column written at save
// time must carry slugs byte-identical to the ids inkling's HTML export
// stamps on `<hN>` tags — feed/TOC anchors join on them. The kobata side is
// the port in `@/shared/lexical/heading-slug`; this test runs both sides
// over the same state and compares.

const HEADING_TEXTS = [
  'Hello World',
  '你好 世界',
  'Repeat',
  'Repeat',
  'repeat',
  'Foo! Bar?  baz',
  'C++ & C#',
  '   ',
  '!!!',
] as const

const TAGS = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'h2', 'h2', 'h2'] as const

function extractHeadingIds(html: string): { depth: number; id: string }[] {
  const out: { depth: number; id: string }[] = []
  for (const match of html.matchAll(/<h([1-6]) id="([^"]*)">/g)) {
    out.push({ depth: Number(match[1]), id: match[2]! })
  }
  return out
}

describe('contracts/lexical-heading-slug — save-time slugs vs inkling export ids', () => {
  it('the slugify port matches the export id for every heading, duplicates included', async () => {
    const state = lexicalBodyWith(HEADING_TEXTS.map((text, i) => lexicalHeading(TAGS[i]!, text)))
    const html = await lexicalStateToHtml(state as SerializedEditorState, {
      onError: (error) => {
        throw error
      },
    })

    const exported = extractHeadingIds(html)
    expect(exported).toHaveLength(HEADING_TEXTS.length)

    // The export assigns an id to EVERY heading (empty-text ones too), in
    // document order, through inkling's per-render dedup tracker.
    const track = createHeadingSlugTracker()
    const expected = HEADING_TEXTS.map((text, i) => ({
      depth: Number(TAGS[i]![1]),
      id: track(slugifyHeadingText(text)),
    }))
    expect(exported).toEqual(expected)
  })

  it('collectLexicalHeadings carries exactly the exported ids of the non-empty headings', async () => {
    const state = lexicalBodyWith(HEADING_TEXTS.map((text, i) => lexicalHeading(TAGS[i]!, text)))
    const html = await lexicalStateToHtml(state as SerializedEditorState, {
      onError: (error) => {
        throw error
      },
    })

    const exported = new Set(extractHeadingIds(html).map((h) => h.id))

    // Every collected entry's slug must appear among the export's ids.
    const collected = collectLexicalHeadings(state)
    for (const heading of collected) {
      expect(exported.has(heading.slug), `${heading.text} → ${heading.slug}`).toBe(true)
    }

    // And the collected slugs are exactly the tracker outputs for the
    // non-empty headings, in document order (empty-text headings consume a
    // tracker slot but produce no entry).
    const track = createHeadingSlugTracker()
    const expected = HEADING_TEXTS.map((text) => ({ text: text.trim(), slug: track(slugifyHeadingText(text)) }))
      .filter((h) => h.text.length > 0)
      .map((h) => h.slug)
    expect(collected.map((h) => h.slug)).toEqual(expected)
  })
})
