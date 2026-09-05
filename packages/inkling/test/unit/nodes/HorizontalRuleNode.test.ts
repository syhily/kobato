import { createHeadlessEditor } from '@lexical/headless'
import { type LexicalEditor } from 'lexical'
import { beforeEach, describe, expect, it } from 'vitest'

import { getCardMenu } from '#/utils/card-menu'
import { updateEditor } from '#/utils/test-editor'
import { getCardDragIcon } from '@/nodes/cards/card-menus'
import {
  HorizontalRuleNode,
  $createHorizontalRuleNode,
  $isHorizontalRuleNode,
  INSERT_HORIZONTAL_RULE_COMMAND,
} from '@/nodes/HorizontalRuleNode'

const editorNodes = [HorizontalRuleNode]

describe('HorizontalRuleNode', () => {
  let editor: LexicalEditor

  beforeEach(() => {
    editor = createHeadlessEditor({ nodes: editorNodes, onError: () => {} })
  })

  it('matches node with $isHorizontalRuleNode', async () => {
    await updateEditor(editor, () => {
      const node = $createHorizontalRuleNode()
      expect($isHorizontalRuleNode(node)).toBe(true)
    })
  })

  it('resolves a card menu entry', () => {
    expect(getCardMenu('horizontalrule')?.[0]?.label).toBe('Divider')
    expect(getCardMenu('horizontalrule')?.[0]?.insertCommand).toBe(INSERT_HORIZONTAL_RULE_COMMAND)
  })

  it('resolves the divider drag icon from the card menu', () => {
    expect(typeof getCardDragIcon('horizontalrule')).toBe('function')
  })
})
