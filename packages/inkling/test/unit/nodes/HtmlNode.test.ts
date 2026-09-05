import { createHeadlessEditor } from '@lexical/headless'
import { type LexicalEditor } from 'lexical'
import { beforeEach, describe, expect, it } from 'vitest'

import { getCardMenu } from '#/utils/card-menu'
import { updateEditor } from '#/utils/test-editor'
import { getCardDragIcon } from '@/nodes/cards/card-menus'
import { HtmlNode, $createHtmlNode, $isHtmlNode, INSERT_HTML_COMMAND } from '@/nodes/HtmlNode'

const editorNodes = [HtmlNode]

describe('HtmlNode', () => {
  let editor: LexicalEditor

  beforeEach(() => {
    editor = createHeadlessEditor({ nodes: editorNodes, onError: () => {} })
  })

  it('matches node with $isHtmlNode', async () => {
    await updateEditor(editor, () => {
      const node = $createHtmlNode({})
      expect($isHtmlNode(node)).toBe(true)
    })
  })

  it('resolves a card menu entry', () => {
    expect(getCardMenu('html')?.[0]?.label).toBe('HTML')
    expect(getCardMenu('html')?.[0]?.insertCommand).toBe(INSERT_HTML_COMMAND)
  })

  it('resolves the html drag icon from the card menu', () => {
    expect(typeof getCardDragIcon('html')).toBe('function')
  })
})
