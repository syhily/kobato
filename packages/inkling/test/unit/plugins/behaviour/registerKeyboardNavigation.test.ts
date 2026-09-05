import { $createLinkNode, $isLinkNode, LinkNode } from '@lexical/link'
import { $createListItemNode, $createListNode, ListItemNode, ListNode } from '@lexical/list'
import {
  $createLineBreakNode,
  $createNodeSelection,
  $createParagraphNode,
  $createTextNode,
  $getNodeByKey,
  $getRoot,
  $getSelection,
  $isDecoratorNode,
  $isLineBreakNode,
  $isNodeSelection,
  $isParagraphNode,
  $isRangeSelection,
  $isTextNode,
  $setSelection,
  createEditor,
  DELETE_LINE_COMMAND,
  INSERT_PARAGRAPH_COMMAND,
  KEY_ARROW_DOWN_COMMAND,
  KEY_ARROW_UP_COMMAND,
  KEY_BACKSPACE_COMMAND,
  KEY_DELETE_COMMAND,
  KEY_DOWN_COMMAND,
  KEY_ENTER_COMMAND,
  KEY_ESCAPE_COMMAND,
  KEY_TAB_COMMAND,
  type LexicalCommand,
  type LexicalEditor,
  type LexicalNodeConfig,
  COMMAND_PRIORITY_LOW,
} from 'lexical'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { updateEditor } from '#/utils/test-editor'
import { $isCodeBlockNode, CodeBlockNode } from '@/nodes/CodeBlockNode'
import { $createImageNode, ImageNode } from '@/nodes/ImageNode'
import { createCardSelectionStore, type CardSelectionStore } from '@/plugins/behaviour/cardSelectionStore'
import { DELETE_CARD_COMMAND, SELECT_CARD_COMMAND } from '@/plugins/behaviour/commands'
import { markEventFromCaptionEditor } from '@/plugins/behaviour/nested-editor-protocol'
import { registerKeyboardNavigation } from '@/plugins/behaviour/registerKeyboardNavigation'

// Minimal node set that lets the keyboard plugin's listeners run in jsdom.
const KEYBOARD_TEST_NODES = [ImageNode, ListNode, ListItemNode, CodeBlockNode, LinkNode]

function createTestEditor(nodes: LexicalNodeConfig[] = KEYBOARD_TEST_NODES) {
  return createEditor({
    namespace: 'test',
    nodes,
    onError: () => {},
  })
}

function dispatchAndCommit<T>(editor: LexicalEditor, command: LexicalCommand<T>, payload: T): Promise<boolean> {
  return new Promise((resolve) => {
    let result = false
    editor.update(
      () => {
        result = editor.dispatchCommand(command, payload)
      },
      { onUpdate: () => resolve(result) },
    )
  })
}

function mountEditor(editor: LexicalEditor) {
  const root = document.createElement('div')
  root.contentEditable = 'true'
  root.setAttribute('data-lexical-editor', 'true')
  document.body.appendChild(root)
  editor.setRootElement(root)

  // jsdom does not always update document.activeElement on focus; ensure the
  // keyboard handlers see the editor root as the active element.
  const activeElementSpy = vi.spyOn(document, 'activeElement', 'get').mockReturnValue(root)

  // jsdom has no layout engine; provide a default rect so Lexical can sync
  // the DOM selection after updates without throwing.
  const boundingClientRectSpy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    bottom: 0,
    height: 0,
    left: 0,
    right: 0,
    top: 0,
    width: 0,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  } as DOMRect)
  const originalRangeGetBoundingClientRect = Reflect.get(Range.prototype, 'getBoundingClientRect') as () => DOMRect
  Range.prototype.getBoundingClientRect = () =>
    ({
      bottom: 0,
      height: 0,
      left: 0,
      right: 0,
      top: 0,
      width: 0,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }) as DOMRect

  return {
    root,
    restore: () => {
      activeElementSpy.mockRestore()
      boundingClientRectSpy.mockRestore()
      Range.prototype.getBoundingClientRect = originalRangeGetBoundingClientRect
      root.remove()
    },
  }
}

/**
 * Build a fake native Selection whose single range reports the requested top.
 * Used to drive $isAtTopOfNode in jsdom where real layout rects are all zero.
 */
function createNativeSelectionMock(opts: { anchorNode: Node; rangeTop: number }): Selection {
  const { anchorNode, rangeTop } = opts
  const rect: DOMRect = {
    bottom: rangeTop,
    height: 0,
    left: 0,
    right: 0,
    top: rangeTop,
    width: 0,
    x: 0,
    y: rangeTop,
    toJSON: () => ({}),
  }
  const range = {
    cloneRange: () => range,
    getClientRects: () => [rect],
    getBoundingClientRect: () => rect,
  }
  return {
    anchorNode,
    getRangeAt: () => range,
    setBaseAndExtent: () => {},
  } as unknown as Selection
}

/**
 * Place a collapsed Lexical selection at the requested offset inside a text node
 * and attach a native selection double that reports the requested visual line.
 */
async function setSelectionAt(
  editor: LexicalEditor,
  root: HTMLElement,
  textNodeKey: string,
  offset: number,
  rangeTop: number,
) {
  await updateEditor(editor, () => {
    const textNode = $getNodeByKey(textNodeKey)
    if ($isTextNode(textNode)) {
      textNode.select(offset, offset)
    }
  })

  const paragraphElement = root.querySelector('p')
  if (paragraphElement) {
    paragraphElement.getBoundingClientRect = () =>
      ({
        bottom: 0,
        height: 0,
        left: 0,
        right: 0,
        top: 0,
        width: 0,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect
  }

  const domElement = editor.getElementByKey(textNodeKey)
  const domNode = domElement?.firstChild
  if (domNode) {
    vi.spyOn(window, 'getSelection').mockReturnValue(createNativeSelectionMock({ anchorNode: domNode, rangeTop }))
  }
}

describe('registerKeyboardNavigation', () => {
  let editor: LexicalEditor
  let store: CardSelectionStore
  let mounted: ReturnType<typeof mountEditor> | null = null

  beforeEach(() => {
    editor = createTestEditor()
    store = createCardSelectionStore()
    document.body.innerHTML = ''
    mounted = null
  })

  afterEach(() => {
    mounted?.restore()
    document.body.innerHTML = ''
  })

  function registerWithCardKey(cardKey: string | null = null) {
    store.setState({ selectedCardKey: cardKey })
    return registerKeyboardNavigation(editor, { store })
  }

  it('registers keyboard command listeners and returns a cleanup function', () => {
    const cleanup = registerWithCardKey()
    expect(typeof cleanup).toBe('function')
    cleanup()
  })

  it('cleans up registered command listeners', () => {
    const command = KEY_ENTER_COMMAND
    const beforeSize = (editor as unknown as { _commands: Map<unknown, unknown[]> })._commands.get(command)?.length ?? 0

    const cleanup = registerWithCardKey()

    const duringSize = (editor as unknown as { _commands: Map<unknown, unknown[]> })._commands.get(command)?.length ?? 0
    expect(duringSize).toBeGreaterThan(beforeSize)

    cleanup()

    const afterSize = (editor as unknown as { _commands: Map<unknown, unknown[]> })._commands.get(command)?.length ?? 0
    expect(afterSize).toBe(beforeSize)
  })

  it('inserts a new paragraph after a selected card on enter', async () => {
    let cardKey = ''
    await updateEditor(editor, () => {
      const root = $getRoot()
      const image = $createImageNode({ src: '/image.png' })
      root.append(image)
      cardKey = image.getKey()
    })

    mounted = mountEditor(editor)
    const cleanup = registerWithCardKey(cardKey)

    const result = await dispatchAndCommit(editor, KEY_ENTER_COMMAND, new KeyboardEvent('keydown', { key: 'Enter' }))
    expect(result).toBe(true)

    editor.getEditorState().read(() => {
      const root = $getRoot()
      expect(root.getChildrenSize()).toBe(2)
      const inserted = root.getChildAtIndex(1)
      expect($isParagraphNode(inserted)).toBe(true)
      const selection = $getSelection()
      expect($isRangeSelection(selection)).toBe(true)
      expect($isRangeSelection(selection) && selection.anchor.getNode().is(inserted)).toBe(true)
    })

    cleanup()
  })

  it('does not intercept enter when the selected card has been removed', async () => {
    let cardKey = ''
    await updateEditor(editor, () => {
      const root = $getRoot()
      const image = $createImageNode({ src: '/image.png' })
      root.append(image)
      cardKey = image.getKey()
    })

    // remove the card while the store still points at its key
    await updateEditor(editor, () => {
      $getNodeByKey(cardKey)?.remove()
    })

    mounted = mountEditor(editor)
    const cleanup = registerWithCardKey(cardKey)

    const event = new KeyboardEvent('keydown', { key: 'Enter', cancelable: true })
    const result = await dispatchAndCommit(editor, KEY_ENTER_COMMAND, event)
    expect(result).toBe(false)
    expect(event.defaultPrevented).toBe(false)

    cleanup()
  })

  it('toggles card edit mode on meta+enter when a card is selected', async () => {
    const { $createCodeBlockNode } = await import('@/nodes/CodeBlockNode')
    let cardKey = ''
    await updateEditor(editor, () => {
      const root = $getRoot()
      const codeBlock = $createCodeBlockNode({ language: 'javascript' })
      root.append(codeBlock)
      cardKey = codeBlock.getKey()
    })

    mounted = mountEditor(editor)
    const cleanup = registerWithCardKey(cardKey)

    const result = await dispatchAndCommit(
      editor,
      KEY_ENTER_COMMAND,
      new KeyboardEvent('keydown', { key: 'Enter', metaKey: true }),
    )
    expect(result).toBe(true)
    expect(store.getState().isEditingCard).toBe(true)

    cleanup()
  })

  it('selects the previous card when backspacing an empty paragraph after a card', async () => {
    let cardKey = ''
    await updateEditor(editor, () => {
      const root = $getRoot()
      const image = $createImageNode({ src: '/image.png' })
      root.append(image)
      const paragraph = $createParagraphNode()
      root.append(paragraph)
      cardKey = image.getKey()
    })

    mounted = mountEditor(editor)
    const cleanup = registerWithCardKey(null)

    await updateEditor(editor, () => {
      const paragraph = $getRoot().getChildAtIndex(1)
      if ($isParagraphNode(paragraph)) {
        paragraph.selectStart()
      }
    })

    const result = await dispatchAndCommit(
      editor,
      KEY_BACKSPACE_COMMAND,
      new KeyboardEvent('keydown', { key: 'Backspace' }),
    )
    expect(result).toBe(true)

    editor.getEditorState().read(() => {
      const selection = $getSelection()
      expect($isNodeSelection(selection)).toBe(true)
      const selectedNode = selection?.getNodes()[0]
      expect(selectedNode?.getKey()).toBe(cardKey)
    })

    cleanup()
  })

  it('deletes the last character of a preceding link on backspace (firefox workaround)', async () => {
    await updateEditor(editor, () => {
      const root = $getRoot()
      const paragraph = $createParagraphNode()
      const link = $createLinkNode('https://example.com')
      link.append($createTextNode('link text'))
      const textNode = $createTextNode('after')
      paragraph.append(link)
      paragraph.append(textNode)
      root.append(paragraph)
      textNode.select(0, 0)
    })

    mounted = mountEditor(editor)
    const cleanup = registerWithCardKey(null)

    const result = await dispatchAndCommit(
      editor,
      KEY_BACKSPACE_COMMAND,
      new KeyboardEvent('keydown', { key: 'Backspace' }),
    )
    expect(result).toBe(true)

    editor.getEditorState().read(() => {
      const paragraph = $getRoot().getFirstChild()
      const link = $isParagraphNode(paragraph) ? paragraph.getFirstChild() : null
      expect($isLinkNode(link)).toBe(true)
      expect(link?.getTextContent()).toBe('link tex')
    })

    cleanup()
  })

  it('converts a populated top-level list item to a paragraph on backspace at its start', async () => {
    await updateEditor(editor, () => {
      const root = $getRoot()
      const list = $createListNode('bullet')
      const item = $createListItemNode()
      const text = $createTextNode('item text')
      item.append(text)
      list.append(item)
      root.append(list)
      text.select(0, 0)
    })

    mounted = mountEditor(editor)
    const cleanup = registerWithCardKey(null)

    const result = await dispatchAndCommit(
      editor,
      KEY_BACKSPACE_COMMAND,
      new KeyboardEvent('keydown', { key: 'Backspace' }),
    )
    expect(result).toBe(true)

    editor.getEditorState().read(() => {
      const root = $getRoot()
      expect(root.getChildrenSize()).toBe(1)
      const first = root.getFirstChild()
      expect($isParagraphNode(first)).toBe(true)
      expect(first?.getTextContent()).toBe('item text')
    })

    cleanup()
  })

  it('dispatches INSERT_PARAGRAPH_COMMAND for an empty top-level list item on backspace', async () => {
    await updateEditor(editor, () => {
      const root = $getRoot()
      const list = $createListNode('bullet')
      const item = $createListItemNode()
      list.append(item)
      root.append(list)
      item.select(0, 0)
    })

    mounted = mountEditor(editor)
    const cleanup = registerWithCardKey(null)

    // the conversion itself is upstream rich-text's INSERT_PARAGRAPH handler
    // (the real editor mounts it via RichTextPlugin) — this test pins the
    // policy: the key is claimed and the command dispatched
    let dispatched = false
    const unregisterSpy = editor.registerCommand(
      INSERT_PARAGRAPH_COMMAND,
      () => {
        dispatched = true
        return false
      },
      COMMAND_PRIORITY_LOW,
    )

    const result = await dispatchAndCommit(
      editor,
      KEY_BACKSPACE_COMMAND,
      new KeyboardEvent('keydown', { key: 'Backspace' }),
    )
    expect(result).toBe(true)
    expect(dispatched).toBe(true)

    unregisterSpy()
    cleanup()
  })

  it('selects the next card on arrow down from an empty paragraph', async () => {
    let cardKey = ''
    await updateEditor(editor, () => {
      const root = $getRoot()
      const paragraph = $createParagraphNode()
      root.append(paragraph)
      const image = $createImageNode({ src: '/image.png' })
      root.append(image)
      cardKey = image.getKey()
    })

    mounted = mountEditor(editor)
    const cleanup = registerWithCardKey(null)

    await updateEditor(editor, () => {
      const paragraph = $getRoot().getChildAtIndex(0)
      if ($isParagraphNode(paragraph)) {
        paragraph.selectStart()
      }
    })

    const result = await dispatchAndCommit(
      editor,
      KEY_ARROW_DOWN_COMMAND,
      new KeyboardEvent('keydown', { key: 'ArrowDown' }),
    )
    expect(result).toBe(true)

    editor.getEditorState().read(() => {
      const selection = $getSelection()
      expect($isNodeSelection(selection)).toBe(true)
      const selectedNode = selection?.getNodes()[0]
      expect(selectedNode?.getKey()).toBe(cardKey)
    })

    cleanup()
  })

  it('dispatches SELECT_CARD_COMMAND on escape when editing a card', async () => {
    let cardKey = ''
    await updateEditor(editor, () => {
      const root = $getRoot()
      const image = $createImageNode({ src: '/image.png' })
      root.append(image)
      cardKey = image.getKey()
    })

    mounted = mountEditor(editor)
    const selectCardListener = vi.fn()
    const unregister = editor.registerCommand(SELECT_CARD_COMMAND, selectCardListener, 0)
    store.setState({ selectedCardKey: cardKey, isEditingCard: true })
    const cleanup = registerKeyboardNavigation(editor, { store })

    const result = await dispatchAndCommit(editor, KEY_ESCAPE_COMMAND, new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(result).toBe(true)
    expect(selectCardListener.mock.calls[0]?.[0]).toMatchObject({ cardKey })

    cleanup()
    unregister()
  })

  it('does not handle escape when nothing is selected in a top-level editor', async () => {
    mounted = mountEditor(editor)
    const cleanup = registerWithCardKey(null)

    const result = await dispatchAndCommit(editor, KEY_ESCAPE_COMMAND, new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(result).toBe(false)

    cleanup()
  })

  it('does not handle escape when a card is selected but not editing', async () => {
    let cardKey = ''
    await updateEditor(editor, () => {
      const root = $getRoot()
      const image = $createImageNode({ src: '/image.png' })
      root.append(image)
      cardKey = image.getKey()
    })

    mounted = mountEditor(editor)
    const cleanup = registerWithCardKey(cardKey)

    const result = await dispatchAndCommit(editor, KEY_ESCAPE_COMMAND, new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(result).toBe(false)

    cleanup()
  })

  it('handles escape in a nested editor by focusing the parent root', async () => {
    const parentEditor = createTestEditor()
    const parentRoot = document.createElement('div')
    parentRoot.contentEditable = 'true'
    document.body.appendChild(parentRoot)
    parentEditor.setRootElement(parentRoot)
    const focusSpy = vi.spyOn(parentRoot, 'focus')

    const nestedEditor = createEditor({
      namespace: 'nested',
      nodes: KEYBOARD_TEST_NODES,
      parentEditor,
      onError: () => {},
    })
    mounted = mountEditor(nestedEditor)
    const cleanup = registerKeyboardNavigation(nestedEditor, { store })

    const result = await dispatchAndCommit(
      nestedEditor,
      KEY_ESCAPE_COMMAND,
      new KeyboardEvent('keydown', { key: 'Escape' }),
    )
    expect(result).toBe(true)
    expect(focusSpy).toHaveBeenCalled()

    cleanup()
    focusSpy.mockRestore()
    parentRoot.remove()
  })

  it('prevents tab from leaving the editor', async () => {
    await updateEditor(editor, () => {
      const root = $getRoot()
      const paragraph = $createParagraphNode()
      paragraph.append($createTextNode('hello'))
      root.append(paragraph)
      paragraph.selectEnd()
    })

    mounted = mountEditor(editor)
    const cleanup = registerWithCardKey(null)

    const result = await dispatchAndCommit(editor, KEY_TAB_COMMAND, new KeyboardEvent('keydown', { key: 'Tab' }))
    expect(result).toBe(true)

    cleanup()
  })

  // Plan 052 Step 1: characterization pins for the enter/tab code-fence
  // shortcut, which had zero unit coverage. They pin CURRENT behavior per
  // trigger ahead of the card-shortcut seam migration; enter/tab trigger
  // semantics differ from the markdown transformer trigger on purpose.
  describe('code fence shortcut', () => {
    async function setupFenceParagraph(text: string) {
      await updateEditor(editor, () => {
        const root = $getRoot()
        const paragraph = $createParagraphNode()
        const textNode = $createTextNode(text)
        paragraph.append(textNode)
        root.append(paragraph)
        textNode.select(text.length, text.length)
      })
    }

    it('transforms ```js into a selected code block in edit mode on enter', async () => {
      await setupFenceParagraph('```js')
      mounted = mountEditor(editor)
      const cleanup = registerWithCardKey(null)

      const result = await dispatchAndCommit(editor, KEY_ENTER_COMMAND, new KeyboardEvent('keydown', { key: 'Enter' }))
      expect(result).toBe(true)

      editor.getEditorState().read(() => {
        const root = $getRoot()
        expect(root.getChildrenSize()).toBe(1)
        const codeBlock = root.getFirstChild()
        expect($isCodeBlockNode(codeBlock)).toBe(true)
        expect(codeBlock).toMatchObject({ __openInEditMode: true, language: 'js' })
        const selection = $getSelection()
        expect($isNodeSelection(selection)).toBe(true)
        expect(selection?.getNodes()[0]?.getKey()).toBe(codeBlock?.getKey())
      })

      cleanup()
    })

    it('transforms ```js into a selected code block in edit mode on tab', async () => {
      await setupFenceParagraph('```js')
      mounted = mountEditor(editor)
      const cleanup = registerWithCardKey(null)

      const result = await dispatchAndCommit(editor, KEY_TAB_COMMAND, new KeyboardEvent('keydown', { key: 'Tab' }))
      expect(result).toBe(true)

      editor.getEditorState().read(() => {
        const root = $getRoot()
        expect(root.getChildrenSize()).toBe(1)
        const codeBlock = root.getFirstChild()
        expect($isCodeBlockNode(codeBlock)).toBe(true)
        expect(codeBlock).toMatchObject({ __openInEditMode: true, language: 'js' })
        const selection = $getSelection()
        expect($isNodeSelection(selection)).toBe(true)
        expect(selection?.getNodes()[0]?.getKey()).toBe(codeBlock?.getKey())
      })

      cleanup()
    })

    it('transforms a bare ``` fence into a code block with an empty language on enter', async () => {
      await setupFenceParagraph('```')
      mounted = mountEditor(editor)
      const cleanup = registerWithCardKey(null)

      const result = await dispatchAndCommit(editor, KEY_ENTER_COMMAND, new KeyboardEvent('keydown', { key: 'Enter' }))
      expect(result).toBe(true)

      editor.getEditorState().read(() => {
        const codeBlock = $getRoot().getFirstChild()
        expect($isCodeBlockNode(codeBlock)).toBe(true)
        expect(codeBlock).toMatchObject({ __openInEditMode: true, language: '' })
      })

      cleanup()
    })

    it('still transforms a fence whose language exceeds 10 word chars on enter', async () => {
      // Records CURRENT enter/tab behavior for an over-long language: the
      // enter/tab regex /^```(\w{1,10})?/ is not end-anchored, so the 10-char
      // cap is NOT enforced on this trigger — the transform fires and the
      // FULL rest of the line becomes the language. The markdown transformer
      // trigger (regex terminated by \s) would not fire here; pinned as data
      // for the plan-052 seam, not flattened.
      await setupFenceParagraph('```abcdefghijkl')
      mounted = mountEditor(editor)
      const cleanup = registerWithCardKey(null)

      const result = await dispatchAndCommit(editor, KEY_ENTER_COMMAND, new KeyboardEvent('keydown', { key: 'Enter' }))
      expect(result).toBe(true)

      editor.getEditorState().read(() => {
        const codeBlock = $getRoot().getFirstChild()
        expect($isCodeBlockNode(codeBlock)).toBe(true)
        expect(codeBlock).toMatchObject({ language: 'abcdefghijkl' })
      })

      cleanup()
    })

    it('takes the full rest of the line as the language on enter (```js extra)', async () => {
      // enter/tab extract the language via textContent.replace(/^```/, ''),
      // diverging from the transformer trigger's match[1] capture — pinned
      // as data for the plan-052 seam.
      await setupFenceParagraph('```js extra')
      mounted = mountEditor(editor)
      const cleanup = registerWithCardKey(null)

      const result = await dispatchAndCommit(editor, KEY_ENTER_COMMAND, new KeyboardEvent('keydown', { key: 'Enter' }))
      expect(result).toBe(true)

      editor.getEditorState().read(() => {
        const codeBlock = $getRoot().getFirstChild()
        expect($isCodeBlockNode(codeBlock)).toBe(true)
        expect(codeBlock).toMatchObject({ language: 'js extra' })
      })

      cleanup()
    })

    it('does not transform the fence in a nested editor (isNested guard)', async () => {
      await setupFenceParagraph('```js')
      mounted = mountEditor(editor)
      const cleanup = registerKeyboardNavigation(editor, { store, isNested: true })

      const result = await dispatchAndCommit(editor, KEY_ENTER_COMMAND, new KeyboardEvent('keydown', { key: 'Enter' }))
      expect(result).toBe(false)

      editor.getEditorState().read(() => {
        const root = $getRoot()
        expect(root.getChildrenSize()).toBe(1)
        const paragraph = root.getFirstChild()
        expect($isParagraphNode(paragraph)).toBe(true)
        expect(paragraph?.getTextContent()).toBe('```js')
      })

      cleanup()
    })
  })

  // The shift+arrow selection extension had zero coverage at any level (no
  // shiftKey in the unit suite, no Shift+Arrow in e2e) while living as two
  // ~50-line mirror blocks. The direction-parameterized helper
  // ($extendSelectionAcrossCardBoundary) is pure Lexical selection arithmetic
  // — no geometry — so the boundary matrix is pinned here for both
  // directions, plus the caption-provenance return the arrow handlers share.
  describe('shift+arrow selection extension', () => {
    /** Build a flat document of cards and text paragraphs, in order. */
    async function setupBlocks(blocks: string[]) {
      const keys: { cardKeys: string[]; textNodeKeys: string[] } = { cardKeys: [], textNodeKeys: [] }
      await updateEditor(editor, () => {
        const root = $getRoot()
        for (const block of blocks) {
          if (block === 'card') {
            const image = $createImageNode({ src: '/image.png' })
            root.append(image)
            keys.cardKeys.push(image.getKey())
          } else {
            const paragraph = $createParagraphNode()
            const textNode = $createTextNode(block)
            paragraph.append(textNode)
            root.append(paragraph)
            keys.textNodeKeys.push(textNode.getKey())
          }
        }
      })
      return keys
    }

    async function selectTextRange(textNodeKey: string, anchorOffset: number, focusOffset: number) {
      await updateEditor(editor, () => {
        const textNode = $getNodeByKey(textNodeKey)
        if ($isTextNode(textNode)) {
          textNode.select(anchorOffset, focusOffset)
        }
      })
    }

    async function selectNode(cardKey: string) {
      await updateEditor(editor, () => {
        const nodeSelection = $createNodeSelection()
        nodeSelection.add(cardKey)
        $setSelection(nodeSelection)
      })
    }

    function readSelectionPoints() {
      return editor.getEditorState().read(() => {
        const selection = $getSelection()
        if (!$isRangeSelection(selection)) {
          return null
        }
        return {
          anchorKey: selection.anchor.key,
          anchorOffset: selection.anchor.offset,
          focusKey: selection.focus.key,
          focusOffset: selection.focus.offset,
        }
      })
    }

    function shiftArrowEvent(key: 'ArrowUp' | 'ArrowDown') {
      // cancelable like a real keydown so preventDefault is observable
      return new KeyboardEvent('keydown', { key, shiftKey: true, cancelable: true })
    }

    it('extends onto the card above on shift+arrow up at the start of a paragraph', async () => {
      const { textNodeKeys } = await setupBlocks(['card', 'hello'])
      await selectTextRange(textNodeKeys[0], 0, 0)
      mounted = mountEditor(editor)
      const cleanup = registerWithCardKey(null)

      const event = shiftArrowEvent('ArrowUp')
      const result = await dispatchAndCommit(editor, KEY_ARROW_UP_COMMAND, event)

      expect(result).toBe(true)
      expect(event.defaultPrevented).toBe(true)
      // the paragraph is treated as not selected: the extension covers the card only
      expect(readSelectionPoints()).toEqual({ anchorKey: 'root', anchorOffset: 1, focusKey: 'root', focusOffset: 0 })

      cleanup()
    })

    it('selects the entire current node on shift+arrow up mid-paragraph with a card above', async () => {
      const { textNodeKeys } = await setupBlocks(['card', 'hello'])
      await selectTextRange(textNodeKeys[0], 3, 3)
      mounted = mountEditor(editor)
      const cleanup = registerWithCardKey(null)

      const event = shiftArrowEvent('ArrowUp')
      const result = await dispatchAndCommit(editor, KEY_ARROW_UP_COMMAND, event)

      expect(result).toBe(true)
      expect(event.defaultPrevented).toBe(true)
      expect(readSelectionPoints()).toEqual({ anchorKey: 'root', anchorOffset: 2, focusKey: 'root', focusOffset: 1 })

      cleanup()
    })

    it('falls through to default behavior on shift+arrow up between two text blocks', async () => {
      const { textNodeKeys } = await setupBlocks(['one', 'two'])
      await selectTextRange(textNodeKeys[1], 1, 1)
      mounted = mountEditor(editor)
      const cleanup = registerWithCardKey(null)

      const result = await dispatchAndCommit(editor, KEY_ARROW_UP_COMMAND, shiftArrowEvent('ArrowUp'))

      expect(result).toBe(false)
      expect(readSelectionPoints()).toEqual({
        anchorKey: textNodeKeys[1],
        anchorOffset: 1,
        focusKey: textNodeKeys[1],
        focusOffset: 1,
      })

      cleanup()
    })

    it('extends the root-offset selection one more node on a repeated shift+arrow up', async () => {
      const { textNodeKeys } = await setupBlocks(['card', 'card', 'hello'])
      await selectTextRange(textNodeKeys[0], 0, 0)
      mounted = mountEditor(editor)
      const cleanup = registerWithCardKey(null)

      await dispatchAndCommit(editor, KEY_ARROW_UP_COMMAND, shiftArrowEvent('ArrowUp'))
      expect(readSelectionPoints()).toEqual({ anchorKey: 'root', anchorOffset: 2, focusKey: 'root', focusOffset: 1 })

      await dispatchAndCommit(editor, KEY_ARROW_UP_COMMAND, shiftArrowEvent('ArrowUp'))
      expect(readSelectionPoints()).toEqual({ anchorKey: 'root', anchorOffset: 2, focusKey: 'root', focusOffset: 0 })

      cleanup()
    })

    it('consumes shift+arrow up at the start of the document without moving the focus', async () => {
      const { textNodeKeys } = await setupBlocks(['card', 'hello'])
      await selectTextRange(textNodeKeys[0], 0, 0)
      mounted = mountEditor(editor)
      const cleanup = registerWithCardKey(null)

      await dispatchAndCommit(editor, KEY_ARROW_UP_COMMAND, shiftArrowEvent('ArrowUp'))
      const event = shiftArrowEvent('ArrowUp')
      const result = await dispatchAndCommit(editor, KEY_ARROW_UP_COMMAND, event)

      expect(result).toBe(true)
      expect(event.defaultPrevented).toBe(true)
      expect(readSelectionPoints()).toEqual({ anchorKey: 'root', anchorOffset: 1, focusKey: 'root', focusOffset: 0 })

      cleanup()
    })

    it('falls through to default behavior on shift+arrow up with a node selection', async () => {
      const { cardKeys } = await setupBlocks(['card', 'hello'])
      await selectNode(cardKeys[0])
      mounted = mountEditor(editor)
      const cleanup = registerWithCardKey(null)

      const result = await dispatchAndCommit(editor, KEY_ARROW_UP_COMMAND, shiftArrowEvent('ArrowUp'))

      expect(result).toBe(false)

      cleanup()
    })

    it('extends onto the card below on shift+arrow down at the end of a paragraph', async () => {
      const { textNodeKeys } = await setupBlocks(['hello', 'card'])
      await selectTextRange(textNodeKeys[0], 5, 5)
      mounted = mountEditor(editor)
      const cleanup = registerWithCardKey(null)

      const event = shiftArrowEvent('ArrowDown')
      const result = await dispatchAndCommit(editor, KEY_ARROW_DOWN_COMMAND, event)

      expect(result).toBe(true)
      expect(event.defaultPrevented).toBe(true)
      // the paragraph is treated as not selected: the extension covers the card only
      expect(readSelectionPoints()).toEqual({ anchorKey: 'root', anchorOffset: 1, focusKey: 'root', focusOffset: 2 })

      cleanup()
    })

    it('selects the entire current node on shift+arrow down mid-paragraph with a card below', async () => {
      const { textNodeKeys } = await setupBlocks(['hello', 'card'])
      await selectTextRange(textNodeKeys[0], 2, 2)
      mounted = mountEditor(editor)
      const cleanup = registerWithCardKey(null)

      const event = shiftArrowEvent('ArrowDown')
      const result = await dispatchAndCommit(editor, KEY_ARROW_DOWN_COMMAND, event)

      expect(result).toBe(true)
      expect(event.defaultPrevented).toBe(true)
      expect(readSelectionPoints()).toEqual({ anchorKey: 'root', anchorOffset: 0, focusKey: 'root', focusOffset: 1 })

      cleanup()
    })

    it('falls through to default behavior on shift+arrow down between two text blocks', async () => {
      const { textNodeKeys } = await setupBlocks(['one', 'two'])
      await selectTextRange(textNodeKeys[0], 1, 1)
      mounted = mountEditor(editor)
      const cleanup = registerWithCardKey(null)

      const result = await dispatchAndCommit(editor, KEY_ARROW_DOWN_COMMAND, shiftArrowEvent('ArrowDown'))

      expect(result).toBe(false)
      expect(readSelectionPoints()).toEqual({
        anchorKey: textNodeKeys[0],
        anchorOffset: 1,
        focusKey: textNodeKeys[0],
        focusOffset: 1,
      })

      cleanup()
    })

    it('extends the root-offset selection one more node on a repeated shift+arrow down', async () => {
      const { textNodeKeys } = await setupBlocks(['hello', 'card', 'card'])
      await selectTextRange(textNodeKeys[0], 5, 5)
      mounted = mountEditor(editor)
      const cleanup = registerWithCardKey(null)

      await dispatchAndCommit(editor, KEY_ARROW_DOWN_COMMAND, shiftArrowEvent('ArrowDown'))
      expect(readSelectionPoints()).toEqual({ anchorKey: 'root', anchorOffset: 1, focusKey: 'root', focusOffset: 2 })

      await dispatchAndCommit(editor, KEY_ARROW_DOWN_COMMAND, shiftArrowEvent('ArrowDown'))
      expect(readSelectionPoints()).toEqual({ anchorKey: 'root', anchorOffset: 1, focusKey: 'root', focusOffset: 3 })

      cleanup()
    })

    it('consumes shift+arrow down at the end of the document without moving the focus', async () => {
      const { textNodeKeys } = await setupBlocks(['hello', 'card'])
      await selectTextRange(textNodeKeys[0], 5, 5)
      mounted = mountEditor(editor)
      const cleanup = registerWithCardKey(null)

      await dispatchAndCommit(editor, KEY_ARROW_DOWN_COMMAND, shiftArrowEvent('ArrowDown'))
      const event = shiftArrowEvent('ArrowDown')
      const result = await dispatchAndCommit(editor, KEY_ARROW_DOWN_COMMAND, event)

      expect(result).toBe(true)
      expect(event.defaultPrevented).toBe(true)
      expect(readSelectionPoints()).toEqual({ anchorKey: 'root', anchorOffset: 1, focusKey: 'root', focusOffset: 2 })

      cleanup()
    })

    it('falls through to default behavior on shift+arrow down with a node selection', async () => {
      const { cardKeys } = await setupBlocks(['card', 'hello'])
      await selectNode(cardKeys[0])
      mounted = mountEditor(editor)
      const cleanup = registerWithCardKey(null)

      const result = await dispatchAndCommit(editor, KEY_ARROW_DOWN_COMMAND, shiftArrowEvent('ArrowDown'))

      expect(result).toBe(false)

      cleanup()
    })

    it('reselects the card on an arrow up event re-dispatched from its caption editor', async () => {
      const { cardKeys } = await setupBlocks(['card', 'hello'])
      mounted = mountEditor(editor)
      const cleanup = registerWithCardKey(cardKeys[0])

      const event = markEventFromCaptionEditor(new KeyboardEvent('keydown', { key: 'ArrowUp' }))
      const result = await dispatchAndCommit(editor, KEY_ARROW_UP_COMMAND, event)

      expect(result).toBe(true)
      editor.getEditorState().read(() => {
        const selection = $getSelection()
        expect($isNodeSelection(selection)).toBe(true)
        expect($isNodeSelection(selection) && selection.has(cardKeys[0])).toBe(true)
      })

      cleanup()
    })

    it('reselects the card on an arrow down event re-dispatched from its caption editor', async () => {
      const { cardKeys } = await setupBlocks(['card', 'hello'])
      mounted = mountEditor(editor)
      const cleanup = registerWithCardKey(cardKeys[0])

      const event = markEventFromCaptionEditor(new KeyboardEvent('keydown', { key: 'ArrowDown' }))
      const result = await dispatchAndCommit(editor, KEY_ARROW_DOWN_COMMAND, event)

      expect(result).toBe(true)
      editor.getEditorState().read(() => {
        const selection = $getSelection()
        expect($isNodeSelection(selection)).toBe(true)
        expect($isNodeSelection(selection) && selection.has(cardKeys[0])).toBe(true)
      })

      cleanup()
    })

    it('does not consume a caption-marked arrow when no card is selected', async () => {
      const { textNodeKeys } = await setupBlocks(['hello'])
      await selectTextRange(textNodeKeys[0], 0, 0)
      mounted = mountEditor(editor)
      const cleanup = registerWithCardKey(null)

      const event = markEventFromCaptionEditor(new KeyboardEvent('keydown', { key: 'ArrowUp' }))
      const result = await dispatchAndCommit(editor, KEY_ARROW_UP_COMMAND, event)

      expect(result).toBe(false)

      cleanup()
    })
  })

  describe('DELETE_LINE_COMMAND', () => {
    it('removes a one-line paragraph after a card and selects the card when caret is on the first visual line', async () => {
      let cardKey = ''
      let textNodeKey = ''
      let textNodeSize = 0
      await updateEditor(editor, () => {
        const root = $getRoot()
        const image = $createImageNode({ src: '/image.png' })
        const paragraph = $createParagraphNode()
        const textNode = $createTextNode('Some content')
        paragraph.append(textNode)
        root.append(image)
        root.append(paragraph)
        cardKey = image.getKey()
        textNodeKey = textNode.getKey()
        textNodeSize = textNode.getTextContentSize()
      })

      mounted = mountEditor(editor)
      const cleanup = registerWithCardKey(null)
      await setSelectionAt(editor, mounted.root, textNodeKey, textNodeSize, 0)

      const result = await dispatchAndCommit(editor, DELETE_LINE_COMMAND, true)
      expect(result).toBe(true)

      editor.getEditorState().read(() => {
        const root = $getRoot()
        expect(root.getChildrenSize()).toBe(1)
        expect($isDecoratorNode(root.getFirstChild())).toBe(true)
        const selection = $getSelection()
        expect($isNodeSelection(selection)).toBe(true)
        expect(selection?.getNodes()[0]?.getKey()).toBe(cardKey)
      })

      cleanup()
    })

    it('preserves text after the caret when deleting a one-line paragraph backward', async () => {
      let textNodeKey = ''
      await updateEditor(editor, () => {
        const root = $getRoot()
        const image = $createImageNode({ src: '/image.png' })
        const paragraph = $createParagraphNode()
        const textNode = $createTextNode('Some content')
        paragraph.append(textNode)
        root.append(image)
        root.append(paragraph)
        textNodeKey = textNode.getKey()
      })

      mounted = mountEditor(editor)
      const cleanup = registerWithCardKey(null)
      await setSelectionAt(editor, mounted.root, textNodeKey, 5, 0)

      const result = await dispatchAndCommit(editor, DELETE_LINE_COMMAND, true)
      expect(result).toBe(true)

      editor.getEditorState().read(() => {
        const root = $getRoot()
        expect(root.getChildrenSize()).toBe(2)
        const paragraph = root.getChildAtIndex(1)
        expect($isParagraphNode(paragraph)).toBe(true)
        expect($isParagraphNode(paragraph) && paragraph.getChildrenSize()).toBe(1)
        const remainingText = $isParagraphNode(paragraph) ? paragraph.getFirstChild() : null
        expect($isTextNode(remainingText)).toBe(true)
        expect(remainingText?.getTextContent()).toBe('content')
        const selection = $getSelection()
        expect($isRangeSelection(selection)).toBe(true)
      })

      cleanup()
    })

    it('preserves a multi-line paragraph after a card when deleting the first visual line backward', async () => {
      let textNodeKey = ''
      let textNodeSize = 0
      await updateEditor(editor, () => {
        const root = $getRoot()
        const image = $createImageNode({ src: '/image.png' })
        const paragraph = $createParagraphNode()
        const textNode = $createTextNode('first line')
        paragraph.append(textNode)
        paragraph.append($createLineBreakNode())
        paragraph.append($createTextNode('later line'))
        root.append(image)
        root.append(paragraph)
        textNodeKey = textNode.getKey()
        textNodeSize = textNode.getTextContentSize()
      })

      mounted = mountEditor(editor)
      const cleanup = registerWithCardKey(null)
      await setSelectionAt(editor, mounted.root, textNodeKey, textNodeSize, 0)

      const result = await dispatchAndCommit(editor, DELETE_LINE_COMMAND, true)
      expect(result).toBe(true)

      editor.getEditorState().read(() => {
        const root = $getRoot()
        expect(root.getChildrenSize()).toBe(2)
        const paragraph = root.getChildAtIndex(1)
        expect($isParagraphNode(paragraph)).toBe(true)
        expect($isParagraphNode(paragraph) && paragraph.getChildrenSize()).toBe(2)
        expect($isLineBreakNode($isParagraphNode(paragraph) ? paragraph.getChildAtIndex(0) : null)).toBe(true)
        const remainingText = $isParagraphNode(paragraph) ? paragraph.getChildAtIndex(1) : null
        expect($isTextNode(remainingText)).toBe(true)
        expect(remainingText?.getTextContent()).toBe('later line')
        const selection = $getSelection()
        expect($isRangeSelection(selection)).toBe(true)
      })

      cleanup()
    })

    it('preserves text after the caret when deleting the first visual line backward', async () => {
      let textNodeKey = ''
      await updateEditor(editor, () => {
        const root = $getRoot()
        const image = $createImageNode({ src: '/image.png' })
        const paragraph = $createParagraphNode()
        const textNode = $createTextNode('first line')
        paragraph.append(textNode)
        paragraph.append($createLineBreakNode())
        paragraph.append($createTextNode('later line'))
        root.append(image)
        root.append(paragraph)
        textNodeKey = textNode.getKey()
      })

      mounted = mountEditor(editor)
      const cleanup = registerWithCardKey(null)
      await setSelectionAt(editor, mounted.root, textNodeKey, 5, 0)

      const result = await dispatchAndCommit(editor, DELETE_LINE_COMMAND, true)
      expect(result).toBe(true)

      editor.getEditorState().read(() => {
        const root = $getRoot()
        expect(root.getChildrenSize()).toBe(2)
        const paragraph = root.getChildAtIndex(1)
        expect($isParagraphNode(paragraph)).toBe(true)
        expect($isParagraphNode(paragraph) && paragraph.getChildrenSize()).toBe(3)
        const firstChild = $isParagraphNode(paragraph) ? paragraph.getFirstChild() : null
        expect($isTextNode(firstChild)).toBe(true)
        expect(firstChild?.getTextContent()).toBe(' line')
        expect($isLineBreakNode($isParagraphNode(paragraph) ? paragraph.getChildAtIndex(1) : null)).toBe(true)
        const laterText = $isParagraphNode(paragraph) ? paragraph.getChildAtIndex(2) : null
        expect($isTextNode(laterText)).toBe(true)
        expect(laterText?.getTextContent()).toBe('later line')
        const selection = $getSelection()
        expect($isRangeSelection(selection)).toBe(true)
      })

      cleanup()
    })

    it('preserves remaining content when the first visual line ends inside a link node', async () => {
      let linkTextNodeKey = ''
      let linkTextNodeSize = 0
      await updateEditor(editor, () => {
        const root = $getRoot()
        const image = $createImageNode({ src: '/image.png' })
        const paragraph = $createParagraphNode()
        const link = $createLinkNode('https://example.com')
        const linkTextNode = $createTextNode('first line')
        link.append(linkTextNode)
        paragraph.append(link)
        paragraph.append($createLineBreakNode())
        paragraph.append($createTextNode('later line'))
        root.append(image)
        root.append(paragraph)
        linkTextNodeKey = linkTextNode.getKey()
        linkTextNodeSize = linkTextNode.getTextContentSize()
      })

      mounted = mountEditor(editor)
      const cleanup = registerWithCardKey(null)
      await setSelectionAt(editor, mounted.root, linkTextNodeKey, linkTextNodeSize, 0)

      const result = await dispatchAndCommit(editor, DELETE_LINE_COMMAND, true)
      expect(result).toBe(true)

      editor.getEditorState().read(() => {
        const root = $getRoot()
        expect(root.getChildrenSize()).toBe(2)
        const paragraph = root.getChildAtIndex(1)
        expect($isParagraphNode(paragraph)).toBe(true)
        const remaining = $isParagraphNode(paragraph) ? paragraph.getChildren().map((child) => child.getType()) : []
        expect(remaining).toEqual(['linebreak', 'text'])
        const laterText = $isParagraphNode(paragraph) ? paragraph.getChildAtIndex(1) : null
        expect($isTextNode(laterText)).toBe(true)
        expect(laterText?.getTextContent()).toBe('later line')
      })

      cleanup()
    })

    it('does not handle DELETE_LINE_COMMAND when caret is not on the first visual line', async () => {
      let textNodeKey = ''
      let textNodeSize = 0
      await updateEditor(editor, () => {
        const root = $getRoot()
        const image = $createImageNode({ src: '/image.png' })
        const paragraph = $createParagraphNode()
        paragraph.append($createTextNode('first line'))
        paragraph.append($createLineBreakNode())
        const textNode = $createTextNode('later line')
        paragraph.append(textNode)
        root.append(image)
        root.append(paragraph)
        textNodeKey = textNode.getKey()
        textNodeSize = textNode.getTextContentSize()
      })

      mounted = mountEditor(editor)
      const cleanup = registerWithCardKey(null)
      await setSelectionAt(editor, mounted.root, textNodeKey, textNodeSize, 100)

      const result = await dispatchAndCommit(editor, DELETE_LINE_COMMAND, true)
      expect(result).toBe(false)

      editor.getEditorState().read(() => {
        const root = $getRoot()
        expect(root.getChildrenSize()).toBe(2)
        expect($isDecoratorNode(root.getFirstChild())).toBe(true)
        expect($isParagraphNode(root.getChildAtIndex(1))).toBe(true)
      })

      cleanup()
    })

    it('removes a one-line paragraph before a card and selects the card on forward DELETE_LINE_COMMAND', async () => {
      let cardKey = ''
      let textNodeKey = ''
      await updateEditor(editor, () => {
        const root = $getRoot()
        const paragraph = $createParagraphNode()
        const textNode = $createTextNode('Some content')
        paragraph.append(textNode)
        const image = $createImageNode({ src: '/image.png' })
        root.append(paragraph)
        root.append(image)
        cardKey = image.getKey()
        textNodeKey = textNode.getKey()
      })

      mounted = mountEditor(editor)
      const cleanup = registerWithCardKey(null)
      await setSelectionAt(editor, mounted.root, textNodeKey, 0, 0)

      const result = await dispatchAndCommit(editor, DELETE_LINE_COMMAND, false)
      expect(result).toBe(true)

      editor.getEditorState().read(() => {
        const root = $getRoot()
        expect(root.getChildrenSize()).toBe(1)
        expect($isDecoratorNode(root.getFirstChild())).toBe(true)
        const selection = $getSelection()
        expect($isNodeSelection(selection)).toBe(true)
        expect(selection?.getNodes()[0]?.getKey()).toBe(cardKey)
      })

      cleanup()
    })

    it('does not handle DELETE_LINE_COMMAND for a paragraph that is not adjacent to a card', async () => {
      let textNodeKey = ''
      let textNodeSize = 0
      await updateEditor(editor, () => {
        const root = $getRoot()
        const paragraph = $createParagraphNode()
        const textNode = $createTextNode('Some content')
        paragraph.append(textNode)
        root.append(paragraph)
        textNodeKey = textNode.getKey()
        textNodeSize = textNode.getTextContentSize()
      })

      mounted = mountEditor(editor)
      const cleanup = registerWithCardKey(null)
      await setSelectionAt(editor, mounted.root, textNodeKey, textNodeSize, 0)

      const result = await dispatchAndCommit(editor, DELETE_LINE_COMMAND, true)
      expect(result).toBe(false)

      cleanup()
    })

    it('deletes a selected card via DELETE_CARD_COMMAND on DELETE_LINE_COMMAND', async () => {
      let cardKey = ''
      await updateEditor(editor, () => {
        const root = $getRoot()
        const image = $createImageNode({ src: '/image.png' })
        root.append(image)
        cardKey = image.getKey()
      })

      mounted = mountEditor(editor)
      const deleteCardListener = vi.fn()
      const unregister = editor.registerCommand(DELETE_CARD_COMMAND, deleteCardListener, 0)
      store.setState({ selectedCardKey: cardKey })
      const cleanup = registerKeyboardNavigation(editor, { store })

      const result = await dispatchAndCommit(editor, DELETE_LINE_COMMAND, true)
      expect(result).toBe(true)
      expect(deleteCardListener.mock.calls[0]?.[0]).toEqual({ cardKey, direction: 'backward' })

      cleanup()
      unregister()
    })

    it('does not delete a selected card in a nested editor on DELETE_LINE_COMMAND', async () => {
      let cardKey = ''
      await updateEditor(editor, () => {
        const root = $getRoot()
        const image = $createImageNode({ src: '/image.png' })
        root.append(image)
        cardKey = image.getKey()
      })

      mounted = mountEditor(editor)
      const deleteCardListener = vi.fn()
      const unregister = editor.registerCommand(DELETE_CARD_COMMAND, deleteCardListener, 0)
      store.setState({ selectedCardKey: cardKey })
      const cleanup = registerKeyboardNavigation(editor, { store, isNested: true })

      const result = await dispatchAndCommit(editor, DELETE_LINE_COMMAND, true)
      expect(result).toBe(false)
      expect(deleteCardListener).not.toHaveBeenCalled()

      cleanup()
      unregister()
    })
  })

  describe('card adjacency characterization', () => {
    it('removes a following card on forward delete from the end of a populated paragraph', async () => {
      let textNodeSize = 0
      await updateEditor(editor, () => {
        const root = $getRoot()
        const paragraph = $createParagraphNode()
        const textNode = $createTextNode('Some content')
        paragraph.append(textNode)
        const image = $createImageNode({ src: '/image.png' })
        root.append(paragraph)
        root.append(image)
        textNodeSize = textNode.getTextContentSize()
        textNode.select(textNodeSize, textNodeSize)
      })

      mounted = mountEditor(editor)
      const cleanup = registerWithCardKey(null)

      const result = await dispatchAndCommit(
        editor,
        KEY_DELETE_COMMAND,
        new KeyboardEvent('keydown', { key: 'Delete' }),
      )
      expect(result).toBe(true)

      editor.getEditorState().read(() => {
        const root = $getRoot()
        expect(root.getChildrenSize()).toBe(1)
        const paragraph = root.getFirstChild()
        expect($isParagraphNode(paragraph)).toBe(true)
        expect(paragraph?.getTextContent()).toBe('Some content')
        const selection = $getSelection()
        expect($isRangeSelection(selection)).toBe(true)
        expect($isRangeSelection(selection) && selection.anchor.offset).toBe(textNodeSize)
      })

      cleanup()
    })

    it('removes a previous card on backspace at the start of a populated paragraph', async () => {
      await updateEditor(editor, () => {
        const root = $getRoot()
        const image = $createImageNode({ src: '/image.png' })
        const paragraph = $createParagraphNode()
        const textNode = $createTextNode('Some content')
        paragraph.append(textNode)
        root.append(image)
        root.append(paragraph)
        textNode.select(0, 0)
      })

      mounted = mountEditor(editor)
      const cleanup = registerWithCardKey(null)

      const result = await dispatchAndCommit(
        editor,
        KEY_BACKSPACE_COMMAND,
        new KeyboardEvent('keydown', { key: 'Backspace' }),
      )
      expect(result).toBe(true)

      editor.getEditorState().read(() => {
        const root = $getRoot()
        expect(root.getChildrenSize()).toBe(1)
        const paragraph = root.getFirstChild()
        expect($isParagraphNode(paragraph)).toBe(true)
        expect(paragraph?.getTextContent()).toBe('Some content')
        const selection = $getSelection()
        expect($isRangeSelection(selection)).toBe(true)
        expect($isRangeSelection(selection) && selection.anchor.offset).toBe(0)
      })

      cleanup()
    })

    it('selects the last card on meta+arrow down when the document ends with a card', async () => {
      let cardKey = ''
      await updateEditor(editor, () => {
        const root = $getRoot()
        const paragraph = $createParagraphNode()
        paragraph.append($createTextNode('Some content'))
        root.append(paragraph)
        const image = $createImageNode({ src: '/image.png' })
        root.append(image)
        cardKey = image.getKey()
        paragraph.selectEnd()
      })

      mounted = mountEditor(editor)
      const cleanup = registerWithCardKey(null)

      const result = await dispatchAndCommit(
        editor,
        KEY_DOWN_COMMAND,
        new KeyboardEvent('keydown', { key: 'ArrowDown', metaKey: true }),
      )
      expect(result).toBe(true)

      editor.getEditorState().read(() => {
        const selection = $getSelection()
        expect($isNodeSelection(selection)).toBe(true)
        expect(selection?.getNodes()[0]?.getKey()).toBe(cardKey)
      })

      cleanup()
    })

    it('selects the first card on meta+arrow up when the document starts with a card', async () => {
      let cardKey = ''
      await updateEditor(editor, () => {
        const root = $getRoot()
        const image = $createImageNode({ src: '/image.png' })
        root.append(image)
        const paragraph = $createParagraphNode()
        paragraph.append($createTextNode('Some content'))
        root.append(paragraph)
        cardKey = image.getKey()
        paragraph.selectStart()
      })

      mounted = mountEditor(editor)
      const cleanup = registerWithCardKey(null)

      const result = await dispatchAndCommit(
        editor,
        KEY_DOWN_COMMAND,
        new KeyboardEvent('keydown', { key: 'ArrowUp', metaKey: true }),
      )
      expect(result).toBe(true)

      editor.getEditorState().read(() => {
        const selection = $getSelection()
        expect($isNodeSelection(selection)).toBe(true)
        expect(selection?.getNodes()[0]?.getKey()).toBe(cardKey)
      })

      cleanup()
    })

    it('selects a previous card on arrow up from the first visual line of a populated paragraph', async () => {
      let cardKey = ''
      let textNodeKey = ''
      await updateEditor(editor, () => {
        const root = $getRoot()
        const image = $createImageNode({ src: '/image.png' })
        const paragraph = $createParagraphNode()
        const textNode = $createTextNode('Some content')
        paragraph.append(textNode)
        root.append(image)
        root.append(paragraph)
        cardKey = image.getKey()
        textNodeKey = textNode.getKey()
      })

      mounted = mountEditor(editor)
      const cleanup = registerWithCardKey(null)
      await setSelectionAt(editor, mounted.root, textNodeKey, 5, 0)

      const result = await dispatchAndCommit(
        editor,
        KEY_ARROW_UP_COMMAND,
        new KeyboardEvent('keydown', { key: 'ArrowUp' }),
      )
      expect(result).toBe(true)

      editor.getEditorState().read(() => {
        const selection = $getSelection()
        expect($isNodeSelection(selection)).toBe(true)
        expect(selection?.getNodes()[0]?.getKey()).toBe(cardKey)
      })

      cleanup()
    })

    it('does not handle arrow up below the first visual line of a populated paragraph', async () => {
      let textNodeKey = ''
      await updateEditor(editor, () => {
        const root = $getRoot()
        const image = $createImageNode({ src: '/image.png' })
        const paragraph = $createParagraphNode()
        const textNode = $createTextNode('Some content')
        paragraph.append(textNode)
        root.append(image)
        root.append(paragraph)
        textNodeKey = textNode.getKey()
      })

      mounted = mountEditor(editor)
      const cleanup = registerWithCardKey(null)
      await setSelectionAt(editor, mounted.root, textNodeKey, 5, 100)

      const result = await dispatchAndCommit(
        editor,
        KEY_ARROW_UP_COMMAND,
        new KeyboardEvent('keydown', { key: 'ArrowUp' }),
      )
      expect(result).toBe(false)

      editor.getEditorState().read(() => {
        const root = $getRoot()
        expect(root.getChildrenSize()).toBe(2)
        expect($isDecoratorNode(root.getFirstChild())).toBe(true)
        expect($isRangeSelection($getSelection())).toBe(true)
      })

      cleanup()
    })

    it('selects a following card on arrow down from the last visual line of a populated paragraph', async () => {
      let cardKey = ''
      let textNodeKey = ''
      await updateEditor(editor, () => {
        const root = $getRoot()
        const paragraph = $createParagraphNode()
        const textNode = $createTextNode('Some content')
        paragraph.append(textNode)
        const image = $createImageNode({ src: '/image.png' })
        root.append(paragraph)
        root.append(image)
        cardKey = image.getKey()
        textNodeKey = textNode.getKey()
      })

      mounted = mountEditor(editor)
      const cleanup = registerWithCardKey(null)
      await setSelectionAt(editor, mounted.root, textNodeKey, 5, 0)

      const result = await dispatchAndCommit(
        editor,
        KEY_ARROW_DOWN_COMMAND,
        new KeyboardEvent('keydown', { key: 'ArrowDown' }),
      )
      expect(result).toBe(true)

      editor.getEditorState().read(() => {
        const selection = $getSelection()
        expect($isNodeSelection(selection)).toBe(true)
        expect(selection?.getNodes()[0]?.getKey()).toBe(cardKey)
      })

      cleanup()
    })

    it('does not handle arrow down above the last visual line of a populated paragraph', async () => {
      let textNodeKey = ''
      await updateEditor(editor, () => {
        const root = $getRoot()
        const paragraph = $createParagraphNode()
        const textNode = $createTextNode('Some content')
        paragraph.append(textNode)
        const image = $createImageNode({ src: '/image.png' })
        root.append(paragraph)
        root.append(image)
        textNodeKey = textNode.getKey()
      })

      mounted = mountEditor(editor)
      const cleanup = registerWithCardKey(null)
      await setSelectionAt(editor, mounted.root, textNodeKey, 5, 100)

      const result = await dispatchAndCommit(
        editor,
        KEY_ARROW_DOWN_COMMAND,
        new KeyboardEvent('keydown', { key: 'ArrowDown' }),
      )
      expect(result).toBe(false)

      editor.getEditorState().read(() => {
        const root = $getRoot()
        expect(root.getChildrenSize()).toBe(2)
        expect($isDecoratorNode(root.getLastChild())).toBe(true)
        expect($isRangeSelection($getSelection())).toBe(true)
      })

      cleanup()
    })
  })
})
