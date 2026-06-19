import { describe, expect, it } from 'vitest'

import type { InklingDocument, InklingNonRecursiveBlockNode } from '@/shared/inkling/schema'

import {
  collectFootnoteDefinitions,
  collectFootnoteRefs,
  findMissingFootnoteDefinitions,
  inklingFootnoteSectionToPlainText,
  removeOrphanFootnoteDefinitions,
  synchronizeInklingFootnoteIndices,
} from '@/shared/inkling/footnotes'

const EMPTY_INKLING_DOCUMENT: InklingDocument = {
  _type: 'inkling',
  schemaVersion: 1,
  lexicalVersion: '0.45.0',
  root: {
    type: 'root',
    version: 1,
    direction: null,
    format: '',
    indent: 0,
    children: [],
  },
}

function p(text: string): InklingNonRecursiveBlockNode {
  return {
    type: 'paragraph',
    version: 1,
    direction: null,
    format: '',
    indent: 0,
    children: [{ type: 'text', version: 1, text }],
  }
}

function ref(targetKey: string, refKey: string, index: number) {
  return { type: 'footnote-ref' as const, version: 1, targetKey, refKey, index }
}

function def(targetKey: string, index: number, children: InklingNonRecursiveBlockNode[]) {
  return { type: 'footnote-definition' as const, version: 1, targetKey, index, children }
}

function doc(...children: InklingDocument['root']['children']): InklingDocument {
  return {
    ...EMPTY_INKLING_DOCUMENT,
    root: { ...EMPTY_INKLING_DOCUMENT.root, children },
  }
}

describe('shared/inkling/footnotes', () => {
  describe('collectFootnoteRefs', () => {
    it('collects refs from paragraphs in document order', () => {
      const document = doc(
        p('intro'),
        {
          type: 'paragraph',
          version: 1,
          direction: null,
          format: '',
          indent: 0,
          children: [ref('a', 'r1', 1)],
        },
        {
          type: 'paragraph',
          version: 1,
          direction: null,
          format: '',
          indent: 0,
          children: [ref('b', 'r2', 2), ref('a', 'r3', 1)],
        },
      )
      const refs = collectFootnoteRefs(document)
      expect(refs).toEqual([
        { targetKey: 'a', refKey: 'r1', index: 1 },
        { targetKey: 'b', refKey: 'r2', index: 2 },
        { targetKey: 'a', refKey: 'r3', index: 1 },
      ])
    })

    it('collects refs inside links and list items', () => {
      const document = doc({
        type: 'list',
        version: 1,
        listType: 'bullet',
        direction: null,
        format: '',
        indent: 0,
        children: [
          {
            type: 'listitem',
            version: 1,
            value: 1,
            direction: null,
            format: '',
            indent: 0,
            children: [
              {
                type: 'link',
                version: 1,
                url: 'https://example.com',
                direction: null,
                format: '',
                indent: 0,
                children: [ref('c', 'r4', 1)],
              },
            ],
          },
        ],
      })
      const refs = collectFootnoteRefs(document)
      expect(refs).toEqual([{ targetKey: 'c', refKey: 'r4', index: 1 }])
    })

    it('collects refs inside solution and two-column containers', () => {
      const document = doc(
        {
          type: 'solution',
          version: 1,
          children: [
            {
              type: 'paragraph',
              version: 1,
              direction: null,
              format: '',
              indent: 0,
              children: [ref('s', 'r5', 1)],
            },
          ],
        },
        {
          type: 'two-column',
          version: 1,
          left: [
            {
              type: 'paragraph',
              version: 1,
              direction: null,
              format: '',
              indent: 0,
              children: [ref('t', 'r6', 2)],
            },
          ],
          right: [],
        },
      )
      const refs = collectFootnoteRefs(document)
      expect(refs).toEqual([
        { targetKey: 's', refKey: 'r5', index: 1 },
        { targetKey: 't', refKey: 'r6', index: 2 },
      ])
    })

    it('ignores refs inside footnote-definition bodies', () => {
      const document = doc(
        def('a', 1, [
          {
            type: 'paragraph',
            version: 1,
            direction: null,
            format: '',
            indent: 0,
            children: [ref('a', 'r7', 1)],
          },
        ]),
      )
      const refs = collectFootnoteRefs(document)
      expect(refs).toEqual([])
    })
  })

  describe('collectFootnoteDefinitions', () => {
    it('collects definitions in root order', () => {
      const document = doc(def('a', 2, [p('one')]), def('b', 1, [p('two')]))
      const defs = collectFootnoteDefinitions(document)
      expect(defs.map((d) => d.targetKey)).toEqual(['a', 'b'])
      expect(defs[0]?.index).toBe(2)
      expect(defs[1]?.index).toBe(1)
    })
  })

  describe('synchronizeInklingFootnoteIndices', () => {
    it('renumbers indices by first-reference order', () => {
      // First ref is to 'b', then 'a'. Expect b=1, a=2.
      const document = doc(
        {
          type: 'paragraph',
          version: 1,
          direction: null,
          format: '',
          indent: 0,
          children: [ref('b', 'r1', 2)],
        },
        {
          type: 'paragraph',
          version: 1,
          direction: null,
          format: '',
          indent: 0,
          children: [ref('a', 'r2', 1)],
        },
        def('a', 1, [p('def a')]),
        def('b', 2, [p('def b')]),
      )
      const { document: synced, missing, orphans } = synchronizeInklingFootnoteIndices(document)
      expect(missing).toEqual([])
      expect(orphans).toEqual([])

      const refs = collectFootnoteRefs(synced)
      expect(refs.find((r) => r.targetKey === 'b')?.index).toBe(1)
      expect(refs.find((r) => r.targetKey === 'a')?.index).toBe(2)

      const defs = collectFootnoteDefinitions(synced)
      expect(defs.map((d) => ({ key: d.targetKey, index: d.index }))).toEqual([
        { key: 'b', index: 1 },
        { key: 'a', index: 2 },
      ])
    })

    it('appends orphan definitions at the end and reports them', () => {
      const document = doc(
        {
          type: 'paragraph',
          version: 1,
          direction: null,
          format: '',
          indent: 0,
          children: [ref('a', 'r1', 1)],
        },
        def('a', 1, [p('def a')]),
        def('orphan', 2, [p('orphan def')]),
      )
      const { document: synced, missing, orphans } = synchronizeInklingFootnoteIndices(document)
      expect(missing).toEqual([])
      expect(orphans).toEqual(['orphan'])

      const defs = collectFootnoteDefinitions(synced)
      expect(defs.map((d) => d.targetKey)).toEqual(['a', 'orphan'])
      expect(defs[0]?.index).toBe(1)
      expect(defs[1]?.index).toBe(2)
    })

    it('reports missing definitions', () => {
      const document = doc({
        type: 'paragraph',
        version: 1,
        direction: null,
        format: '',
        indent: 0,
        children: [ref('missing', 'r1', 1)],
      })
      const { missing } = synchronizeInklingFootnoteIndices(document)
      expect(missing).toEqual(['missing'])
    })

    it('handles deleted references by keeping orphan definitions', () => {
      const document = doc(def('lonely', 1, [p('lonely def')]))
      const { document: synced, orphans } = synchronizeInklingFootnoteIndices(document)
      expect(orphans).toEqual(['lonely'])
      expect(collectFootnoteDefinitions(synced)[0]?.index).toBe(1)
    })

    it('updates refs inside nested list children and table cells', () => {
      const document = doc(
        {
          type: 'table',
          version: 1,
          rows: [
            {
              type: 'tablerow',
              version: 1,
              cells: [
                {
                  type: 'tablecell',
                  version: 1,
                  direction: null,
                  format: '',
                  indent: 0,
                  children: [ref('x', 'r1', 99)],
                },
              ],
            },
          ],
        },
        def('x', 99, [p('def x')]),
      )
      const { document: synced } = synchronizeInklingFootnoteIndices(document)
      expect(collectFootnoteRefs(synced)[0]?.index).toBe(1)
      expect(collectFootnoteDefinitions(synced)[0]?.index).toBe(1)
    })
  })

  describe('removeOrphanFootnoteDefinitions', () => {
    it('removes definitions with no references', () => {
      const document = doc(
        {
          type: 'paragraph',
          version: 1,
          direction: null,
          format: '',
          indent: 0,
          children: [ref('a', 'r1', 1)],
        },
        def('a', 1, [p('def a')]),
        def('b', 2, [p('def b')]),
      )
      const cleaned = removeOrphanFootnoteDefinitions(document)
      expect(collectFootnoteDefinitions(cleaned).map((d) => d.targetKey)).toEqual(['a'])
    })
  })

  describe('findMissingFootnoteDefinitions', () => {
    it('returns target keys without definitions', () => {
      const document = doc(
        {
          type: 'paragraph',
          version: 1,
          direction: null,
          format: '',
          indent: 0,
          children: [ref('a', 'r1', 1), ref('b', 'r2', 2)],
        },
        def('a', 1, [p('def a')]),
      )
      expect(findMissingFootnoteDefinitions(document)).toEqual(['b'])
    })

    it('deduplicates missing keys', () => {
      const document = doc({
        type: 'paragraph',
        version: 1,
        direction: null,
        format: '',
        indent: 0,
        children: [ref('x', 'r1', 1), ref('x', 'r2', 1)],
      })
      expect(findMissingFootnoteDefinitions(document)).toEqual(['x'])
    })
  })

  describe('inklingFootnoteSectionToPlainText', () => {
    it('renders definition bodies in index order', () => {
      const document = doc(def('b', 2, [p('second')]), def('a', 1, [p('first')]))
      expect(inklingFootnoteSectionToPlainText(document)).toBe('first\nsecond')
    })

    it('omits empty definitions', () => {
      const document = doc(def('a', 1, [p('')]))
      expect(inklingFootnoteSectionToPlainText(document)).toBe('')
    })
  })
})
