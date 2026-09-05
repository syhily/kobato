import { $createParagraphNode, $getRoot, createEditor, type LexicalEditor } from 'lexical'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { registerCaptionTypeToFocus } from '@/plugins/behaviour/nested-editor-protocol'

// The caption type-to-focus policy as a synchronous table: printable key +
// selected card + unfocused caption → focus; every other leg passes through.

describe('registerCaptionTypeToFocus', () => {
  let editor: LexicalEditor
  let rootElement: HTMLElement

  beforeEach(() => {
    vi.restoreAllMocks()
    rootElement = document.createElement('div')
    rootElement.contentEditable = 'true'
    document.body.appendChild(rootElement)
    editor = createEditor({
      namespace: 'test',
      onError: (error) => {
        throw error
      },
    })
    editor.setRootElement(rootElement)
    focusSpy = vi.spyOn(editor, 'focus')
    editor.update(() => {
      $getRoot().append($createParagraphNode())
    })
  })

  let focusSpy: ReturnType<typeof vi.spyOn>

  function typeKey(key: string, { target, ctrlKey = false }: { target?: EventTarget; ctrlKey?: boolean } = {}) {
    const event = new KeyboardEvent('keydown', { key, ctrlKey, bubbles: true })
    ;(target ?? document).dispatchEvent(event)
    return event
  }

  it('focuses the editor on a printable key while selected and unfocused', () => {
    registerCaptionTypeToFocus(editor, { isSelected: () => true, hasFocus: () => false })

    typeKey('a')

    expect(focusSpy).toHaveBeenCalled()
  })

  it.each([
    ['the card is not selected', { isSelected: () => false, hasFocus: () => false }],
    ['the caption already has focus', { isSelected: () => true, hasFocus: () => true }],
  ])('does not focus when %s', (_label, ports) => {
    registerCaptionTypeToFocus(editor, ports)

    typeKey('a')

    expect(focusSpy).not.toHaveBeenCalled()
  })

  it('does not focus on a key with modifiers', () => {
    registerCaptionTypeToFocus(editor, { isSelected: () => true, hasFocus: () => false })

    typeKey('a', { ctrlKey: true })

    expect(focusSpy).not.toHaveBeenCalled()
  })

  it('does not focus for keys landing on an input', () => {
    registerCaptionTypeToFocus(editor, { isSelected: () => true, hasFocus: () => false })

    const input = document.createElement('input')
    document.body.appendChild(input)
    typeKey('a', { target: input })

    expect(focusSpy).not.toHaveBeenCalled()
  })

  it('ignores non-printable keys', () => {
    registerCaptionTypeToFocus(editor, { isSelected: () => true, hasFocus: () => false })

    typeKey('Enter')

    expect(focusSpy).not.toHaveBeenCalled()
  })

  it('stops listening after teardown', () => {
    const teardown = registerCaptionTypeToFocus(editor, { isSelected: () => true, hasFocus: () => false })
    teardown()

    typeKey('a')

    expect(focusSpy).not.toHaveBeenCalled()
  })
})
