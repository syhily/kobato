import { $createParagraphNode, $getRoot, createEditor, type LexicalEditor } from 'lexical'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { TKHandle } from '@/plugins/behaviour/tkHandle'

import { tick } from '#/utils/test-editor'
import { $createTKNode, TKNode } from '@/nodes/base'
import { $createHorizontalRuleNode, HorizontalRuleNode } from '@/nodes/HorizontalRuleNode'
import { applyTkHoverHighlight, registerTkNodeTracking } from '@/plugins/behaviour/tk-tracking'

function createFakeHandle() {
  return {
    addEditorTkNode: vi.fn(),
    removeEditorTkNode: vi.fn(),
    removeEditor: vi.fn(),
  } as unknown as TKHandle & {
    addEditorTkNode: ReturnType<typeof vi.fn>
    removeEditorTkNode: ReturnType<typeof vi.fn>
  }
}

describe('registerTkNodeTracking', () => {
  let editor: LexicalEditor

  beforeEach(() => {
    // mutation listeners only fire on a mounted editor
    const rootElement = document.createElement('div')
    document.body.appendChild(rootElement)
    editor = createEditor({
      namespace: 'test',
      nodes: [TKNode],
      onError: (error) => {
        throw error
      },
    })
    editor.setRootElement(rootElement)
  })

  it('files a created TK node under its top-level element', async () => {
    const handle = createFakeHandle()
    registerTkNodeTracking(editor, handle, null)

    let tkKey = ''
    let paragraphKey = ''
    editor.update(() => {
      const paragraph = $createParagraphNode()
      const tk = $createTKNode('TK')
      paragraph.append(tk)
      $getRoot().append(paragraph)
      tkKey = tk.getKey()
      paragraphKey = paragraph.getKey()
    })
    await tick()

    expect(handle.addEditorTkNode).toHaveBeenCalledWith(editor.getKey(), paragraphKey, tkKey)
  })

  it("files a nested editor's TK nodes under the card key", async () => {
    const handle = createFakeHandle()
    registerTkNodeTracking(editor, handle, 'card-key-1')

    let tkKey = ''
    editor.update(() => {
      const paragraph = $createParagraphNode()
      const tk = $createTKNode('TK')
      paragraph.append(tk)
      $getRoot().append(paragraph)
      tkKey = tk.getKey()
    })
    await tick()

    // the card key wins over the node's own top-level element — the card's
    // indicator owns every TK inside it
    expect(handle.addEditorTkNode).toHaveBeenCalledWith(editor.getKey(), 'card-key-1', tkKey)
  })

  it('removes a destroyed TK node from the handle', async () => {
    const handle = createFakeHandle()
    registerTkNodeTracking(editor, handle, null)

    let tkKey = ''
    editor.update(() => {
      const paragraph = $createParagraphNode()
      const tk = $createTKNode('TK')
      paragraph.append(tk)
      $getRoot().append(paragraph)
      tkKey = tk.getKey()
    })
    await tick()

    editor.update(() => {
      $getRoot().clear()
    })
    await tick()

    expect(handle.removeEditorTkNode).toHaveBeenCalledWith(editor.getKey(), tkKey)
  })
})

describe('applyTkHoverHighlight', () => {
  let editor: LexicalEditor
  let rootElement: HTMLElement

  beforeEach(() => {
    rootElement = document.createElement('div')
    document.body.appendChild(rootElement)
    editor = createEditor({
      namespace: 'test',
      nodes: [TKNode, HorizontalRuleNode],
      onError: (error) => {
        throw error
      },
    })
    editor.setRootElement(rootElement)
  })

  async function insertTk(): Promise<{ paragraphKey: string; tkKey: string }> {
    let keys = { paragraphKey: '', tkKey: '' }
    editor.update(() => {
      const paragraph = $createParagraphNode()
      const tk = $createTKNode('TK')
      paragraph.append(tk)
      $getRoot().append(paragraph)
      keys = { paragraphKey: paragraph.getKey(), tkKey: tk.getKey() }
    })
    await tick()
    return keys
  }

  const classes = { tkClasses: ['tk-rest'], tkHighlightClasses: ['tk-hot'] }

  it('swaps the class sets on the TK elements', async () => {
    const { paragraphKey, tkKey } = await insertTk()
    const element = editor.getElementByKey(tkKey)
    expect(element).not.toBeNull()

    applyTkHoverHighlight(editor, paragraphKey, [tkKey], classes, true)
    expect(element?.classList.contains('tk-hot')).toBe(true)
    expect(element?.classList.contains('tk-rest')).toBe(false)

    applyTkHoverHighlight(editor, paragraphKey, [tkKey], classes, false)
    expect(element?.classList.contains('tk-hot')).toBe(false)
    expect(element?.classList.contains('tk-rest')).toBe(true)
  })

  it('is a no-op when the top-level node is a card', async () => {
    const { tkKey } = await insertTk()
    const element = editor.getElementByKey(tkKey)

    let cardKey = ''
    editor.update(() => {
      const rule = $createHorizontalRuleNode()
      $getRoot().append(rule)
      cardKey = rule.getKey()
    })
    await tick()

    // the parent is a decorator: the highlight must not touch the TK elements
    applyTkHoverHighlight(editor, cardKey, [tkKey], classes, true)
    expect(element?.classList.contains('tk-hot')).toBe(false)
  })
})
