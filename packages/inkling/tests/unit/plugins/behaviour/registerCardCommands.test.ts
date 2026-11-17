import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  createEditor,
  type LexicalEditor,
  type LexicalNodeConfig,
} from 'lexical'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { HorizontalRuleNode } from '../../../../src/nodes/HorizontalRuleNode'
import { $createImageNode, ImageNode } from '../../../../src/nodes/ImageNode'
import { createCardPickerStore } from '../../../../src/plugins/behaviour/cardPickerStore'
import { createCardSelectionStore, type CardSelectionStore } from '../../../../src/plugins/behaviour/cardSelectionStore'
import {
  DELETE_CARD_COMMAND,
  INSERT_CARD_COMMAND,
  SELECT_CARD_COMMAND,
} from '../../../../src/plugins/behaviour/commands'
import { registerCardCommands } from '../../../../src/plugins/behaviour/registerCardCommands'
import { updateEditor } from '../../../utils/test-editor'

function createTestEditor(nodes: LexicalNodeConfig[] = []) {
  return createEditor({
    namespace: 'test',
    nodes: [ImageNode, HorizontalRuleNode, ...nodes],
    onError: () => {},
  })
}

describe('registerCardCommands', () => {
  let editor: LexicalEditor
  let store: CardSelectionStore

  beforeEach(() => {
    vi.clearAllMocks()
    editor = createTestEditor()
    store = createCardSelectionStore()
  })

  function register(deps: Partial<Parameters<typeof registerCardCommands>[1]> = {}) {
    return registerCardCommands(editor, {
      store,
      pickerStore: createCardPickerStore(),
      ...deps,
    })
  }

  it('INSERT_CARD_COMMAND inserts a card and updates selection state', async () => {
    register()

    let imageNode: ImageNode
    await updateEditor(editor, () => {
      const root = $getRoot()
      root.clear()
      const paragraph = $createParagraphNode()
      paragraph.append($createTextNode('hello'))
      root.append(paragraph)
      paragraph.select()

      imageNode = $createImageNode({ src: '/image.png' })

      const dispatched = editor.dispatchCommand(INSERT_CARD_COMMAND, { cardNode: imageNode })
      expect(dispatched).toBe(true)
    })

    expect(store.getState().selectedCardKey).toBe(imageNode!.getKey())

    editor.getEditorState().read(() => {
      const root = $getRoot()
      expect(root.getChildrenSize()).toBeGreaterThan(0)
    })
  })

  it('DELETE_CARD_COMMAND removes a card and preserves a paragraph', async () => {
    register()

    let cardKey = ''
    await updateEditor(editor, () => {
      const root = $getRoot()
      root.clear()
      const imageNode = $createImageNode({ src: '/image.png' })
      root.append(imageNode)
      cardKey = imageNode.getKey()
    })

    const dispatched = editor.dispatchCommand(DELETE_CARD_COMMAND, { cardKey: cardKey! })
    expect(dispatched).toBe(true)

    editor.getEditorState().read(() => {
      expect($getRoot().getChildrenSize()).toBeGreaterThan(0)
    })
  })

  it('SELECT_CARD_COMMAND selects a card by key', async () => {
    register()

    let cardKey = ''
    await updateEditor(editor, () => {
      const root = $getRoot()
      root.clear()
      const imageNode = $createImageNode({ src: '/image.png' })
      root.append(imageNode)
      cardKey = imageNode.getKey()
    })

    const dispatched = editor.dispatchCommand(SELECT_CARD_COMMAND, { cardKey: cardKey! })
    expect(dispatched).toBe(true)
    expect(store.getState().selectedCardKey).toBe(cardKey)
  })
})
