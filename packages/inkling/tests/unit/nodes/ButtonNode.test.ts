import type { LexicalEditor } from 'lexical'

import {
  ButtonNode,
  $createButtonNode,
  $isButtonNode,
  INSERT_BUTTON_COMMAND,
} from '@kobato/inkling-internal/nodes/ButtonNode'
import { getCardDragIcon } from '@kobato/inkling-internal/nodes/cards/card-menus'
import { registerCardDecorateAdapter } from '@kobato/inkling-internal/nodes/decorate-card'
import { getCardMenu } from '@kobato/inkling/tests/utils/card-menu'
import { updateEditor } from '@kobato/inkling/tests/utils/test-editor'
import { createHeadlessEditor } from '@lexical/headless'
import { beforeEach, describe, expect, it } from 'vitest'

// The decorate() assertions below need the wrapper layer's adapter registered
// into the injection port — production gets it from the `.` barrel.
registerCardDecorateAdapter()

const editorNodes = [ButtonNode]

describe('ButtonNode', () => {
  let editor: LexicalEditor

  beforeEach(() => {
    editor = createHeadlessEditor({ nodes: editorNodes, onError: () => {} })
  })

  it('matches node with $isButtonNode', async () => {
    await updateEditor(editor, () => {
      const buttonNode = $createButtonNode()
      expect($isButtonNode(buttonNode)).toBe(true)
    })
  })

  it('resolves a card menu entry', () => {
    expect(getCardMenu('button')?.[0]?.label).toBe('Button')
    expect(getCardMenu('button')?.[0]?.insertCommand).toBe(INSERT_BUTTON_COMMAND)
  })

  it('resolves the button drag icon from the card menu', () => {
    expect(typeof getCardDragIcon('button')).toBe('function')
  })

  it('imports JSON with a legacy text field without failing', async () => {
    await updateEditor(editor, () => {
      const node = ButtonNode.importJSON({
        type: 'button',
        version: 1,
        buttonText: 'Click me',
        buttonUrl: 'https://example.com',
        alignment: 'center',
        // written by earlier versions of this node; no consumer remains, but
        // existing documents must still import cleanly
        text: '<p>Click me</p>',
      })

      expect($isButtonNode(node) && node.buttonText).toBe('Click me')
    })
  })

  describe('decorate', () => {
    it('decorates with the wide wrapper style', async () => {
      await updateEditor(editor, () => {
        const node = $createButtonNode({ buttonText: 'Click', buttonUrl: 'https://example.com' })
        const decorated = node.decorate() as React.ReactElement<{ wrapperStyle?: string }>
        expect(decorated.props.wrapperStyle).toBe('wide')
      })
    })
  })
})
