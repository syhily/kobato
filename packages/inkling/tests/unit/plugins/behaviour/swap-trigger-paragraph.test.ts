import { $swapTriggerParagraph } from '@kobato/inkling-internal/plugins/behaviour/card-menu-trigger'
import { createTestEditor, updateEditor } from '@kobato/inkling/tests/utils/test-editor'
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $getSelection,
  $isRangeSelection,
  $setSelection,
  type LexicalEditor,
} from 'lexical'
import { beforeEach, describe, expect, it, vi } from 'vitest'

describe('$swapTriggerParagraph', () => {
  let editor: LexicalEditor

  beforeEach(() => {
    editor = createTestEditor({ headless: false })
    editor.setRootElement(document.createElement('div'))
  })

  it('replaces the trigger paragraph with a fresh selected one, then dispatches', async () => {
    let triggerKey = ''

    await updateEditor(editor, () => {
      const trigger = $createParagraphNode()
      triggerKey = trigger.getKey()
      const text = $createTextNode('/im')
      trigger.append(text)
      $getRoot().append(trigger)
      text.select(1, 1)
    })

    const dispatch = vi.fn()
    editor.update(() => {
      $swapTriggerParagraph(dispatch)
    })

    editor.read(() => {
      const root = $getRoot()
      expect(root.getChildrenSize()).toBe(1)
      const fresh = root.getFirstChild()!
      expect(fresh.getKey()).not.toBe(triggerKey)
      expect(fresh.getTextContent()).toBe('')

      const selection = $getSelection()
      expect($isRangeSelection(selection)).toBe(true)
      if ($isRangeSelection(selection)) {
        expect(selection.anchor.getNode().getKey()).toBe(fresh.getKey())
      }
    })
    expect(dispatch).toHaveBeenCalledTimes(1)
  })

  it('is a no-op without a range selection', async () => {
    await updateEditor(editor, () => {
      $setSelection(null)
    })

    const dispatch = vi.fn()
    const before = editor.getEditorState().toJSON()
    editor.update(() => {
      $swapTriggerParagraph(dispatch)
    })

    expect(dispatch).not.toHaveBeenCalled()
    expect(editor.getEditorState().toJSON()).toEqual(before)
  })
})
