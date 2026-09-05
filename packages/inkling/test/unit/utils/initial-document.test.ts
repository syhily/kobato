import { createEditor } from 'lexical'
import { describe, expect, it } from 'vitest'

import {
  $appendEmptyParagraph,
  MINIMAL_DOCUMENT,
  MINIMAL_DOCUMENT_LEGACY_PAYLOAD,
  normalizeInitialEditorState,
} from '@/utils/initial-document'

function createThrowingEditor() {
  return createEditor({
    // lexical swallows errors inside updates by default,
    // so we need to throw them to fail the test
    onError: (error) => {
      throw error
    },
  })
}

describe('initial-document', () => {
  describe('payload dialects', () => {
    it('keeps the full dialect as the legacy payload plus textFormat/textStyle', () => {
      const [fullParagraph] = MINIMAL_DOCUMENT.root.children
      const [legacyParagraph] = MINIMAL_DOCUMENT_LEGACY_PAYLOAD.root.children

      expect(fullParagraph).toEqual({ ...legacyParagraph, textFormat: 0, textStyle: '' })
      expect('textFormat' in legacyParagraph).toBe(false)
      expect('textStyle' in legacyParagraph).toBe(false)
    })

    it('parses both dialects to equivalent editor states', () => {
      const editor = createThrowingEditor()

      const fromFull = editor.parseEditorState(MINIMAL_DOCUMENT)
      const fromLegacy = editor.parseEditorState(JSON.stringify(MINIMAL_DOCUMENT_LEGACY_PAYLOAD))

      expect(fromLegacy.toJSON()).toEqual(fromFull.toJSON())
    })
  })

  describe('$appendEmptyParagraph', () => {
    it('seeds the minimal document in a live editor', () => {
      const editor = createThrowingEditor()

      editor.update(() => $appendEmptyParagraph(), { discrete: true })

      expect(editor.getEditorState().toJSON()).toEqual(MINIMAL_DOCUMENT)
    })
  })

  describe('normalizeInitialEditorState', () => {
    it('repairs an empty root in the historical payload dialect', () => {
      const emptyRoot = JSON.stringify({
        root: { children: [], direction: null, format: '', indent: 0, type: 'root', version: 1 },
      })

      const result = normalizeInitialEditorState(emptyRoot) as string

      expect(result).not.toBe(emptyRoot)
      const repaired = JSON.parse(result).root.children[0]
      expect(repaired).toEqual(MINIMAL_DOCUMENT_LEGACY_PAYLOAD.root.children[0])
      expect('textFormat' in repaired).toBe(false)
      expect('textStyle' in repaired).toBe(false)
    })

    it('repairs an empty-root serialized object without mutating it', () => {
      const serialized = JSON.parse(
        JSON.stringify({
          root: { children: [], direction: null, format: '', indent: 0, type: 'root', version: 1 },
        }),
      )

      const result = normalizeInitialEditorState(serialized) as string

      expect(serialized.root.children).toHaveLength(0)
      expect(JSON.parse(result).root.children[0]).toEqual(MINIMAL_DOCUMENT_LEGACY_PAYLOAD.root.children[0])
    })
  })
})
