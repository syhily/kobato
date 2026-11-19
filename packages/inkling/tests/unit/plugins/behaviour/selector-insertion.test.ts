import { $isImageNode } from '@kobato/inkling-internal/nodes/base/nodes/image/ImageNode'
import {
  $createImageNode,
  ImageNode,
  type ImageNode as ImageNodeInstance,
} from '@kobato/inkling-internal/nodes/ImageNode'
import { createCardPickerStore } from '@kobato/inkling-internal/plugins/behaviour/card-picker-store'
import { createCardSelectionStore } from '@kobato/inkling-internal/plugins/behaviour/card-selection-store'
import { registerCardCommands } from '@kobato/inkling-internal/plugins/behaviour/register-card-commands'
import {
  $insertFromSelectorDataset,
  INSERT_FROM_GIF_COMMAND,
  INSERT_FROM_LIBRARY_COMMAND,
  registerSelectorInsertCommands,
} from '@kobato/inkling-internal/plugins/behaviour/selector-insertion'
import { tick } from '@kobato/inkling/tests/utils/test-editor'
import { createHeadlessEditor } from '@lexical/headless'
import { $createNodeSelection, $getRoot, $setSelection, type LexicalEditor } from 'lexical'
import { beforeEach, describe, expect, it } from 'vitest'

describe('selector-insertion', () => {
  let editor: LexicalEditor

  beforeEach(() => {
    editor = createHeadlessEditor({
      nodes: [ImageNode],
      onError: (error) => {
        throw error
      },
    })
    registerCardCommands(editor, { store: createCardSelectionStore(), pickerStore: createCardPickerStore() })
    registerSelectorInsertCommands(editor)
  })

  function insertPlaceholder(): string {
    let key = ''
    editor.update(() => {
      const placeholder = $createImageNode({ src: '', isImageHidden: true })
      $getRoot().append(placeholder)
      const selection = $createNodeSelection()
      selection.add(placeholder.getKey())
      $setSelection(selection)
      key = placeholder.getKey()
    })
    return key
  }

  it('inserts the picked card and removes the placeholder (gif command)', async () => {
    const placeholderKey = insertPlaceholder()

    await tick()
    const picked = { src: 'https://example.com/picked.gif', fileName: 'picked.gif' }
    expect(editor.dispatchCommand(INSERT_FROM_GIF_COMMAND, picked)).toBe(true)
    await tick()

    editor.getEditorState().read(() => {
      const images = $getRoot().getChildren().filter($isImageNode)
      expect(images).toHaveLength(1)
      expect(images[0].getKey()).not.toBe(placeholderKey)
      expect(images[0].src).toBe('https://example.com/picked.gif')
      expect((images[0] as ImageNodeInstance).__isImageHidden).toBeFalsy()
    })
  })

  it('inserts the picked card and removes the placeholder (library command)', async () => {
    const placeholderKey = insertPlaceholder()
    await tick()

    const picked = { src: 'https://example.com/library.jpg', fileName: 'library.jpg' }
    expect(editor.dispatchCommand(INSERT_FROM_LIBRARY_COMMAND, picked)).toBe(true)
    await tick()

    editor.getEditorState().read(() => {
      const images = $getRoot().getChildren().filter($isImageNode)
      expect(images).toHaveLength(1)
      expect(images[0].getKey()).not.toBe(placeholderKey)
    })
  })

  it('returns false and leaves the tree untouched without a selection', () => {
    editor.update(() => {
      $setSelection(null)
      expect($insertFromSelectorDataset({ src: 'https://example.com/x.gif' })).toBe(false)
      expect($getRoot().getChildren()).toHaveLength(0)
    })
  })

  it('registers no commands when the image card is not registered', () => {
    const bare = createHeadlessEditor({
      nodes: [],
      onError: (error) => {
        throw error
      },
    })
    registerSelectorInsertCommands(bare)

    expect(bare.dispatchCommand(INSERT_FROM_GIF_COMMAND, { src: 'https://example.com/x.gif' })).toBe(false)
    expect(bare.dispatchCommand(INSERT_FROM_LIBRARY_COMMAND, { src: 'https://example.com/x.gif' })).toBe(false)
  })
})
