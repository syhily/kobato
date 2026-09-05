import {
  $getRoot,
  $getSelection,
  $isNodeSelection,
  createEditor,
  CLICK_COMMAND,
  CUT_COMMAND,
  type LexicalEditor,
} from 'lexical'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { updateEditor } from '#/utils/test-editor'
import { $createImageNode, ImageNode } from '@/nodes/ImageNode'
import { registerClickAndCut } from '@/plugins/behaviour/registerClickAndCut'

function createTestEditor() {
  return createEditor({
    namespace: 'test',
    nodes: [ImageNode],
    onError: () => {},
  })
}

describe('registerClickAndCut', () => {
  let editor: LexicalEditor

  beforeEach(() => {
    editor = createTestEditor()
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('registers click and cut command listeners and returns a cleanup function', () => {
    const cleanup = registerClickAndCut(editor)

    expect(typeof cleanup).toBe('function')
    cleanup()
  })

  it('swallows cut events originating from a card input until cleanup', () => {
    const input = document.createElement('input')
    document.body.appendChild(input)
    const cleanup = registerClickAndCut(editor)

    const event = { target: input } as unknown as ClipboardEvent
    expect(editor.dispatchCommand(CUT_COMMAND, event)).toBe(true)

    cleanup()

    expect(editor.dispatchCommand(CUT_COMMAND, { target: input } as unknown as ClipboardEvent)).toBe(false)
  })

  it('lets cut events from ordinary targets fall through to Lexical', () => {
    const cleanup = registerClickAndCut(editor)

    const event = { target: document.body } as unknown as ClipboardEvent
    expect(editor.dispatchCommand(CUT_COMMAND, event)).toBe(false)

    cleanup()
  })

  it('lets clicks on ordinary elements fall through to Lexical', () => {
    const cleanup = registerClickAndCut(editor)

    const event = { target: document.createElement('p') } as unknown as MouseEvent
    expect(editor.dispatchCommand(CLICK_COMMAND, event)).toBe(false)

    cleanup()
  })

  it('selects the card when its decorator element is clicked', async () => {
    const root = document.createElement('div')
    root.contentEditable = 'true'
    root.setAttribute('data-lexical-editor', 'true')
    document.body.appendChild(root)
    editor.setRootElement(root)

    // jsdom has no layout engine; provide a default rect so Lexical can sync
    // the DOM selection after updates without throwing.
    const rectSpy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
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

    let cardKey = ''
    await updateEditor(editor, () => {
      const image = $createImageNode({ src: '/image.png' })
      $getRoot().append(image)
      cardKey = image.getKey()
    })

    const cleanup = registerClickAndCut(editor)

    const decoratorElement = root.querySelector('[data-lexical-decorator="true"]')
    expect(decoratorElement).not.toBeNull()

    const preventDefault = vi.fn()
    const event = { target: decoratorElement, preventDefault } as unknown as MouseEvent
    // dispatch inside an awaited commit: the handler's own state change (the
    // card selection) lands in a deferred commit that only flushes after the
    // dispatching update, so a synchronous read would see the pre-dispatch state
    let result = false
    await new Promise<void>((resolve) => {
      editor.update(
        () => {
          result = editor.dispatchCommand(CLICK_COMMAND, event)
        },
        { onUpdate: () => resolve() },
      )
    })

    expect(result).toBe(true)
    expect(preventDefault).toHaveBeenCalled()
    editor.getEditorState().read(() => {
      const selection = $getSelection()
      expect($isNodeSelection(selection)).toBe(true)
      expect($isNodeSelection(selection) && selection.has(cardKey)).toBe(true)
    })

    cleanup()
    rectSpy.mockRestore()
    root.remove()
  })
})
