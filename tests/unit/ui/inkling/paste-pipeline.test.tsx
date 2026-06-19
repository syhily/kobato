// @vitest-environment happy-dom
//
// Paste pipeline tests need a DOM implementation because Lexical's paste
// command parses HTML via DOMParser. happy-dom is already a transitive
// dependency of @lexical/headless, so we use it as the per-file environment.

import { describe, expect, it } from 'vitest'

import type { InklingDocument } from '@/shared/inkling/schema'

import { validateInklingDocumentForMode } from '@/shared/inkling/features'
import { findResidualHtmlInText } from '@/shared/inkling/walk'
import {
  ALL_PASTE_FIXTURES,
  bareFragmentFixture,
  deeplyNestedFixture,
  mixedInlineFixture,
  oldTiptapFixture,
  tableFixture,
  webPageFixture,
} from '@/ui/inkling/poc/paste-fixtures'
import { pasteHtmlIntoEditor } from '@/ui/inkling/poc/paste-probe'

function toInklingDocument(serialized: unknown): InklingDocument {
  const s = serialized as { root: InklingDocument['root'] }
  return {
    _type: 'inkling',
    schemaVersion: 1,
    lexicalVersion: '0.45.0',
    root: s.root,
  }
}

function countNodeTypes(document: InklingDocument): Map<string, number> {
  const counts = new Map<string, number>()
  const stack: Array<{ type: string; children?: unknown }> = [document.root]

  while (stack.length > 0) {
    const node = stack.pop()!
    if (node && typeof node === 'object' && 'type' in node) {
      const type = String(node.type)
      counts.set(type, (counts.get(type) ?? 0) + 1)
      if ('children' in node && Array.isArray(node.children)) {
        for (let i = node.children.length - 1; i >= 0; i -= 1) {
          stack.push(node.children[i] as { type: string; children?: unknown })
        }
      }
      if ('rows' in node && Array.isArray(node.rows)) {
        for (const row of node.rows) {
          stack.push(row as { type: string; children?: unknown })
          if ('cells' in row && Array.isArray(row.cells)) {
            for (const cell of row.cells) {
              stack.push(cell as { type: string; children?: unknown })
            }
          }
        }
      }
    }
  }

  return counts
}

function assertNoXssVectors(document: InklingDocument): void {
  const json = JSON.stringify(document)
  expect(json).not.toMatch(/<script\b/i)
  expect(json).not.toMatch(/<iframe\b/i)
  expect(json).not.toMatch(/\son\w+\s*=/i)
  expect(json).not.toMatch(/javascript:/i)
}

function assertSchemaValid(document: InklingDocument): void {
  const validation = validateInklingDocumentForMode(document, 'article')
  expect(validation.ok).toBe(true)
}

describe('ui/inkling/paste-pipeline', () => {
  it.each(ALL_PASTE_FIXTURES)(
    'pastes $name into a schema-valid Inkling document with no residual HTML',
    async (fixture) => {
      const serialized = await pasteHtmlIntoEditor(fixture.html)
      const document = toInklingDocument(serialized)

      assertSchemaValid(document)
      expect(findResidualHtmlInText(document)).toHaveLength(0)
      assertNoXssVectors(document)
    },
  )

  it('F4 web page drops script/iframe and preserves structure', async () => {
    const serialized = await pasteHtmlIntoEditor(webPageFixture.html)
    const document = toInklingDocument(serialized)
    const counts = countNodeTypes(document)

    expect(counts.get('heading')).toBeGreaterThanOrEqual(1)
    expect(counts.get('paragraph')).toBeGreaterThanOrEqual(1)
    expect(counts.get('link')).toBeGreaterThanOrEqual(1)
    expect(counts.get('list')).toBeGreaterThanOrEqual(1)
    expect(counts.get('quote')).toBeGreaterThanOrEqual(1)

    const json = JSON.stringify(document)
    expect(json).not.toContain('<script')
    expect(json).not.toContain('<iframe')
    expect(json).not.toContain('<img')
    // img either became an image-card or was dropped; it must not leak as text.
    const residual = findResidualHtmlInText(document)
    expect(residual.some((r) => r.text.includes('<img'))).toBe(false)
  })

  it('F5 old-Tiptap footnote-ref round-trips to FootnoteRefNode', async () => {
    const serialized = await pasteHtmlIntoEditor(oldTiptapFixture.html)
    const document = toInklingDocument(serialized)
    const counts = countNodeTypes(document)

    expect(counts.get('footnote-ref')).toBe(1)
    expect(counts.get('code-block')).toBe(1)
    expect(counts.get('quote')).toBe(1)
    expect(counts.get('list')).toBe(1)
  })

  it('F6 markdown-as-text stays as a single paragraph', async () => {
    const serialized = await pasteHtmlIntoEditor('# Heading\n\n- item')
    const document = toInklingDocument(serialized)
    const counts = countNodeTypes(document)

    expect(counts.get('paragraph')).toBe(1)
    expect(counts.get('heading')).toBeUndefined()
    expect(counts.get('list')).toBeUndefined()
  })

  it('F7 mixed inline preserves bold, italic, and link', async () => {
    const serialized = await pasteHtmlIntoEditor(mixedInlineFixture.html)
    const document = toInklingDocument(serialized)
    const counts = countNodeTypes(document)

    expect(counts.get('paragraph')).toBe(1)
    expect(counts.get('link')).toBe(1)
  })

  it('F8 deeply nested divs collapse to paragraphs', async () => {
    const serialized = await pasteHtmlIntoEditor(deeplyNestedFixture.html)
    const document = toInklingDocument(serialized)
    const counts = countNodeTypes(document)

    expect(counts.get('paragraph')).toBeGreaterThanOrEqual(2)
  })

  it('F9 table preserves header row and inline-only cell content', async () => {
    const serialized = await pasteHtmlIntoEditor(tableFixture.html)
    const document = toInklingDocument(serialized)
    const counts = countNodeTypes(document)

    expect(counts.get('table')).toBe(1)
    expect(counts.get('tablerow')).toBeGreaterThanOrEqual(2)
    expect(counts.get('tablecell')).toBeGreaterThanOrEqual(2)

    // Cells must contain only inline nodes (text/link/linebreak).
    function assertCellsInlineOnly(node: unknown): void {
      if (!node || typeof node !== 'object') return
      const n = node as Record<string, unknown>
      if (n.type === 'tablecell' && Array.isArray(n.children)) {
        for (const child of n.children) {
          const c = child as Record<string, unknown> | undefined
          expect(c?.type).not.toBe('paragraph')
          expect(c?.type).not.toBe('heading')
          expect(c?.type).not.toBe('quote')
          expect(c?.type).not.toBe('list')
          expect(c?.type).not.toBe('code-block')
        }
      }
      if (Array.isArray(n.children)) {
        for (const child of n.children) assertCellsInlineOnly(child)
      }
      if (Array.isArray(n.rows)) {
        for (const row of n.rows) {
          assertCellsInlineOnly(row)
          if (row && typeof row === 'object' && 'cells' in row && Array.isArray(row.cells)) {
            for (const cell of row.cells) assertCellsInlineOnly(cell)
          }
        }
      }
    }

    assertCellsInlineOnly(document.root)
  })

  it('F10 bare fragment is wrapped in a paragraph', async () => {
    const serialized = await pasteHtmlIntoEditor(bareFragmentFixture.html)
    const document = toInklingDocument(serialized)
    const counts = countNodeTypes(document)

    expect(document.root.children).toHaveLength(1)
    expect(document.root.children[0]?.type).toBe('paragraph')
    expect(counts.get('paragraph')).toBe(1)
  })
})
