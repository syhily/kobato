import {
  $createParagraphNode,
  $createRangeSelection,
  $createTextNode,
  $getRoot,
  $setSelection,
  type LexicalEditor,
  type TextNode,
} from 'lexical'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createTestEditor, updateEditor } from '#/utils/test-editor'
import { FOCUS_ACTIVE_ATTRIBUTE, FOCUS_MODE_CLASS, registerFocusMode } from '@/plugins/behaviour/focus-mode'

// Focus-mode DOM bookkeeping (@/plugins/behaviour/focus-mode), pinned against
// a rendered editor: the mode class on the root, the active attribute
// tracking the native selection's top-level block (including the
// nested-editor/card-interior and node-selection shapes), and cleanup on
// unregister.

function isFocused(element: Element): boolean {
  return element.hasAttribute(FOCUS_ACTIVE_ATTRIBUTE)
}

describe('registerFocusMode', () => {
  let editor: LexicalEditor
  let rootElement: HTMLElement
  let cleanup: () => void
  let text1: TextNode
  let text2: TextNode

  beforeEach(async () => {
    editor = createTestEditor({ headless: false })
    rootElement = document.createElement('div')
    rootElement.setAttribute('contenteditable', 'true')
    document.body.appendChild(rootElement)
    editor.setRootElement(rootElement)

    await updateEditor(editor, () => {
      const paragraph1 = $createParagraphNode()
      text1 = $createTextNode('first')
      paragraph1.append(text1)
      const paragraph2 = $createParagraphNode()
      text2 = $createTextNode('second')
      paragraph2.append(text2)
      $getRoot().append(paragraph1, paragraph2)
    })

    cleanup = registerFocusMode(editor)
  })

  afterEach(() => {
    cleanup()
    editor.setRootElement(null)
    rootElement.remove()
  })

  function block(index: number): Element {
    const element = rootElement.children[index]
    expect(element).toBeDefined()
    return element
  }

  it('adds the mode class to the root element and marks nothing before a selection', () => {
    expect(rootElement.classList.contains(FOCUS_MODE_CLASS)).toBe(true)
    expect(rootElement.querySelector(`[${FOCUS_ACTIVE_ATTRIBUTE}]`)).toBeNull()
  })

  it('marks the block holding the selection and moves the mark with it', async () => {
    await updateEditor(editor, () => {
      text1.select(0, 0)
    })
    expect(isFocused(block(0))).toBe(true)
    expect(isFocused(block(1))).toBe(false)

    await updateEditor(editor, () => {
      text2.select(1, 1)
    })
    expect(isFocused(block(0))).toBe(false)
    expect(isFocused(block(1))).toBe(true)
  })

  it('marks only the anchor block of a multi-block selection', async () => {
    await updateEditor(editor, () => {
      const selection = $createRangeSelection()
      selection.anchor.set(text1.getKey(), 0, 'text')
      selection.focus.set(text2.getKey(), 3, 'text')
      $setSelection(selection)
    })
    expect(isFocused(block(0))).toBe(true)
    expect(isFocused(block(1))).toBe(false)
  })

  it('resolves a root-anchored selection (the node-selection shape) to the child at its offset', () => {
    window.getSelection()?.setBaseAndExtent(rootElement, 1, rootElement, 2)
    document.dispatchEvent(new Event('selectionchange'))
    expect(isFocused(block(1))).toBe(true)
    expect(isFocused(block(0))).toBe(false)
  })

  it('resolves a selection inside a nested interior (card nested editor) to the whole card block', () => {
    const cardInterior = document.createElement('div')
    const nestedEditable = document.createElement('div')
    nestedEditable.setAttribute('contenteditable', 'true')
    nestedEditable.textContent = 'caption'
    cardInterior.appendChild(nestedEditable)
    block(0).appendChild(cardInterior)

    window.getSelection()?.setBaseAndExtent(nestedEditable.firstChild!, 2, nestedEditable.firstChild!, 2)
    document.dispatchEvent(new Event('selectionchange'))
    expect(isFocused(block(0))).toBe(true)
    expect(isFocused(block(1))).toBe(false)
  })

  it('clears the mark when the selection leaves the editor root', async () => {
    await updateEditor(editor, () => {
      text1.select(0, 0)
    })
    expect(isFocused(block(0))).toBe(true)

    const outside = document.createElement('div')
    outside.textContent = 'outside'
    document.body.appendChild(outside)
    window.getSelection()?.setBaseAndExtent(outside.firstChild!, 1, outside.firstChild!, 1)
    document.dispatchEvent(new Event('selectionchange'))
    expect(rootElement.querySelector(`[${FOCUS_ACTIVE_ATTRIBUTE}]`)).toBeNull()
    outside.remove()
  })

  it('removes the class and every mark on unregister', async () => {
    await updateEditor(editor, () => {
      text2.select(0, 0)
    })
    expect(isFocused(block(1))).toBe(true)

    cleanup()
    // the afterEach cleanup runs again — unregistering twice must be safe
    expect(rootElement.classList.contains(FOCUS_MODE_CLASS)).toBe(false)
    expect(rootElement.querySelector(`[${FOCUS_ACTIVE_ATTRIBUTE}]`)).toBeNull()
  })

  it('stops tracking after unregister', async () => {
    cleanup()
    await updateEditor(editor, () => {
      text1.select(0, 0)
    })
    expect(rootElement.querySelector(`[${FOCUS_ACTIVE_ATTRIBUTE}]`)).toBeNull()
  })
})
