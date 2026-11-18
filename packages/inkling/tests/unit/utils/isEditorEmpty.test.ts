import { isEditorEmpty } from '@kobato/inkling-internal/utils/isEditorEmpty'
import { updateEditor } from '@kobato/inkling/tests/utils/test-editor'
import { createHeadlessEditor } from '@lexical/headless'
import { $createParagraphNode, $createTextNode, $getRoot, type LexicalEditor } from 'lexical'
import { beforeEach, describe, expect, it } from 'vitest'

describe('isEditorEmpty', () => {
  let editor: LexicalEditor

  beforeEach(() => {
    editor = createHeadlessEditor({ onError: () => {} })
  })

  it('returns true for an empty editor', () => {
    expect(isEditorEmpty(editor)).toBe(true)
  })

  it('returns false when the editor has content', async () => {
    await updateEditor(editor, () => {
      const paragraph = $createParagraphNode()
      paragraph.append($createTextNode('Hello'))
      $getRoot().append(paragraph)
    })

    expect(isEditorEmpty(editor)).toBe(false)
  })
})
