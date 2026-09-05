import { createHeadlessEditor } from '@lexical/headless'
import { $createNodeSelection, $getRoot, $setSelection, type LexicalEditor } from 'lexical'
import { beforeEach, describe, expect, it } from 'vitest'

import { tick } from '#/utils/test-editor'
import { $isImageNode } from '@/nodes/base/nodes/image/ImageNode'
import { $createImageNode, ImageNode, type ImageNode as ImageNodeInstance } from '@/nodes/ImageNode'
import { createCardSelectionStore } from '@/plugins/behaviour/cardSelectionStore'
import { registerCardCommands } from '@/plugins/behaviour/registerCardCommands'
import {
  $insertFromSelectorDataset,
  INSERT_FROM_GIF_COMMAND,
  INSERT_FROM_LIBRARY_COMMAND,
  registerSelectorInsertCommands,
} from '@/plugins/behaviour/selector-insertion'

// The selector-insert surgery end to end: a placeholder image node (the
// overlay's ride) selected, a pick dispatched, the real card in its place.

describe('selector-insertion', () => {
  let editor: LexicalEditor

  beforeEach(() => {
    editor = createHeadlessEditor({
      nodes: [ImageNode],
      onError: (error) => {
        throw error
      },
    })
    registerCardCommands(editor, { store: createCardSelectionStore() })
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
    // Lexical 0.46 commits updates on a microtask — tick() drains the queue so
    // assertions see the settled state
    await tick()

    const picked = { src: 'https://example.com/picked.gif', fileName: 'picked.gif' }
    expect(editor.dispatchCommand(INSERT_FROM_GIF_COMMAND, picked)).toBe(true)
    await tick()

    editor.getEditorState().read(() => {
      // exactly one image card: the picked one — the placeholder is gone
      // (the trailing paragraph is the card insert command's after-card rule)
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
