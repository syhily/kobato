import { createHeadlessEditor } from '@lexical/headless'
import { $createParagraphNode, $getRoot, $getSelection, type LexicalEditor } from 'lexical'
import { beforeEach, describe, expect, it } from 'vitest'

import { updateEditor } from '#/utils/test-editor'
import { HorizontalRuleNode } from '@/nodes/HorizontalRuleNode'
import { $selectDecoratorNode } from '@/utils/$selectDecoratorNode'

const editorNodes = [HorizontalRuleNode]

describe('$selectDecoratorNode', () => {
  let editor: LexicalEditor

  beforeEach(() => {
    editor = createHeadlessEditor({ nodes: editorNodes, onError: () => {} })
  })

  it('selects the given node', async () => {
    await updateEditor(editor, () => {
      const paragraph = $createParagraphNode()
      const rule = new HorizontalRuleNode()
      $getRoot().append(paragraph, rule)

      $selectDecoratorNode(rule)
    })

    editor.getEditorState().read(() => {
      const selection = $getSelection()
      expect(selection).not.toBeNull()
      expect(selection?.getNodes()).toHaveLength(1)
      expect(selection?.getNodes()[0].getType()).toBe('horizontalrule')
    })
  })
})
