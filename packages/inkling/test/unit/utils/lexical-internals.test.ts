import { createEditor, type LexicalEditor } from 'lexical'
import { describe, expect, it } from 'vitest'

import {
  getEditorTheme,
  getParentEditor,
  getRegisteredNodeMap,
  getTopLevelEditor,
  isEditorUpdating,
  isNestedEditor,
} from '@/utils/lexical-internals'

function createTestEditor(
  overrides: { parentEditor?: LexicalEditor; theme?: Record<string, unknown> } = {},
): LexicalEditor {
  return createEditor({
    namespace: 'test',
    onError: () => {},
    parentEditor: overrides.parentEditor,
    theme: overrides.theme,
  })
}

describe('lexical-internals adapters', () => {
  describe('editor hierarchy', () => {
    it('root editor has no parent and is not nested', () => {
      const root = createTestEditor()

      expect(getParentEditor(root)).toBeNull()
      expect(isNestedEditor(root)).toBe(false)
      expect(getTopLevelEditor(root)).toBe(root)
    })

    it('child editor returns its immediate parent', () => {
      const root = createTestEditor()
      const child = createTestEditor({ parentEditor: root })

      expect(getParentEditor(child)).toBe(root)
      expect(isNestedEditor(child)).toBe(true)
      expect(getTopLevelEditor(child)).toBe(root)
    })

    it('grandchild editor walks to the top-level editor', () => {
      const root = createTestEditor()
      const child = createTestEditor({ parentEditor: root })
      const grandchild = createTestEditor({ parentEditor: child })

      expect(getParentEditor(grandchild)).toBe(child)
      expect(isNestedEditor(grandchild)).toBe(true)
      expect(getTopLevelEditor(grandchild)).toBe(root)
    })
  })

  describe('getEditorTheme', () => {
    it('returns configured theme classes', () => {
      const theme = { tk: 'tk-class', tkHighlighted: 'tk-highlighted-class' }
      const editor = createTestEditor({ theme })

      expect(getEditorTheme(editor)).toEqual(theme)
    })

    it('returns an empty theme when none is configured', () => {
      const editor = createTestEditor()

      expect(getEditorTheme(editor)).toEqual({})
    })
  })

  describe('getRegisteredNodeMap', () => {
    it('returns a map of registered nodes', () => {
      const editor = createTestEditor()
      const nodeMap = getRegisteredNodeMap(editor)

      expect(nodeMap).toBeInstanceOf(Map)
      expect(nodeMap.size).toBeGreaterThan(0)
      expect(nodeMap.has('root')).toBe(true)
    })
  })

  describe('isEditorUpdating', () => {
    it('returns false outside of an update', () => {
      const editor = createTestEditor()

      expect(isEditorUpdating(editor)).toBe(false)
    })

    it('returns true inside an update callback', () => {
      const editor = createTestEditor()

      editor.update(() => {
        expect(isEditorUpdating(editor)).toBe(true)
      })
    })
  })
})
