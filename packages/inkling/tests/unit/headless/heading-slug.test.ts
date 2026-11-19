import type { SerializedEditorState } from '@kobato/inkling/headless'

import { collectLexicalHeadings } from '@kobato/inkling-internal/headless/collect.ts'
import {
  createHeadingIdTracker as createHeadingSlugTracker,
  lexicalStateToHtml,
  slugify as slugifyHeadingText,
} from '@kobato/inkling/headless'
import { lexicalBodyWith, lexicalHeading } from '@kobato/inkling/tests/utils/lexical.ts'
import { describe, expect, it } from 'vitest'

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

describe('lexical/heading-slug — save-time slugs vs inkling export ids', () => {
  it('the shared slugify implementation matches the export id for every heading, duplicates included', async () => {
    const state = lexicalBodyWith(HEADING_TEXTS.map((text, i) => lexicalHeading(TAGS[i]!, text)))
    const html = await lexicalStateToHtml(state as SerializedEditorState, {
      onError: (error) => {
        throw error
      },
    })

    const exported = extractHeadingIds(html)
    expect(exported).toHaveLength(HEADING_TEXTS.length)

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

    const collected = collectLexicalHeadings(state)
    for (const heading of collected) {
      expect(exported.has(heading.slug), `${heading.text} → ${heading.slug}`).toBe(true)
    }

    const track = createHeadingSlugTracker()
    const expected = HEADING_TEXTS.map((text) => ({ text: text.trim(), slug: track(slugifyHeadingText(text)) }))
      .filter((h) => h.text.length > 0)
      .map((h) => h.slug)
    expect(collected.map((h) => h.slug)).toEqual(expected)
  })
})
