import { createHeadlessEditor } from '@lexical/headless'
import { $createParagraphNode, $createTextNode, $getRoot, type LexicalEditor } from 'lexical'
import { beforeEach, describe, expect, it } from 'vitest'

import { getCardMenu } from '#/utils/card-menu'
import { updateEditor } from '#/utils/test-editor'
import { getCardDragIcon } from '@/nodes/cards/card-menus'
import { ToggleNode, $createToggleNode, $isToggleNode, INSERT_TOGGLE_COMMAND } from '@/nodes/ToggleNode'

const editorNodes = [ToggleNode]

describe('ToggleNode', () => {
  let editor: LexicalEditor

  beforeEach(() => {
    editor = createHeadlessEditor({ nodes: editorNodes, onError: () => {} })
  })

  it('matches node with $isToggleNode', async () => {
    await updateEditor(editor, () => {
      const node = $createToggleNode()
      expect($isToggleNode(node)).toBe(true)
    })
  })

  it('resolves a card menu entry', () => {
    expect(getCardMenu('toggle')?.[0]?.label).toBe('Toggle')
    expect(getCardMenu('toggle')?.[0]?.insertCommand).toBe(INSERT_TOGGLE_COMMAND)
  })

  it('resolves the toggle drag icon from the card menu', () => {
    expect(typeof getCardDragIcon('toggle')).toBe('function')
  })

  it('getDataset includes nested editor references', async () => {
    await updateEditor(editor, () => {
      const node = $createToggleNode({ heading: 'Title', content: 'Body' })
      const dataset = node.getDataset()

      expect(dataset.titleEditor).toBeDefined()
      expect(dataset.contentEditor).toBeDefined()
    })
  })

  it('exports heading and content as html when editors exist', async () => {
    await updateEditor(editor, () => {
      const node = $createToggleNode()

      const makeEditor = () => {
        const nested = createHeadlessEditor({ nodes: editorNodes, onError: () => {} })
        nested.update(
          () => {
            const root = $getRoot()
            root.clear()
            const paragraph = root.append($createParagraphNode())
            paragraph.append($createTextNode('Text'))
          },
          { onUpdate: () => {} },
        )
        return nested
      }

      node.__titleEditor = makeEditor()
      node.__contentEditor = makeEditor()

      const json = node.exportJSON() as Record<string, unknown>
      expect(json.heading).toContain('Text')
      expect(json.content).toContain('Text')
    })
  })
})
