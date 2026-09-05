import {
  $createNodeSelection,
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $setSelection,
  COMMAND_PRIORITY_HIGH,
  createEditor,
  type LexicalEditor,
} from 'lexical'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { updateEditor } from '#/utils/test-editor'
import { $createImageNode, ImageNode } from '@/nodes/ImageNode'
import { DESELECT_CARD_COMMAND } from '@/plugins/behaviour/commands'
import { registerMouseEvents } from '@/plugins/behaviour/registerMouseEvents'

function createTestEditor() {
  return createEditor({
    namespace: 'test',
    nodes: [ImageNode],
    onError: () => {},
  })
}

async function addNodeSelectedCard(editor: LexicalEditor): Promise<string> {
  let cardKey = ''
  await updateEditor(editor, () => {
    const image = $createImageNode({ src: '/image.png' })
    $getRoot().append(image)
    const selection = $createNodeSelection()
    selection.add(image.getKey())
    $setSelection(selection)
    cardKey = image.getKey()
  })
  return cardKey
}

// Higher-priority observer returning false so the dispatch is recorded without
// being swallowed.
function observeDeselects(editor: LexicalEditor) {
  const deselected: string[] = []
  const unregister = editor.registerCommand(
    DESELECT_CARD_COMMAND,
    ({ cardKey }) => {
      deselected.push(cardKey)
      return false
    },
    COMMAND_PRIORITY_HIGH,
  )
  return { deselected, unregister }
}

describe('registerMouseEvents', () => {
  let editor: LexicalEditor
  let container: HTMLElement
  let outside: HTMLElement
  let containerElem: { current: HTMLElement | null }

  beforeEach(() => {
    editor = createTestEditor()
    document.body.innerHTML = ''
    container = document.createElement('div')
    outside = document.createElement('div')
    document.body.append(container, outside)
    containerElem = { current: container }
  })

  afterEach(() => {
    vi.restoreAllMocks()
    document.body.innerHTML = ''
  })

  it('dispatches DESELECT_CARD_COMMAND on mousedown outside the container when a card is node-selected', async () => {
    const cardKey = await addNodeSelectedCard(editor)
    const { deselected, unregister } = observeDeselects(editor)
    const cleanup = registerMouseEvents(editor, { containerElem })

    outside.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))

    expect(deselected).toEqual([cardKey])

    cleanup()
    unregister()
  })

  it('does not deselect on mousedown inside the container', async () => {
    await addNodeSelectedCard(editor)
    const { deselected, unregister } = observeDeselects(editor)
    const cleanup = registerMouseEvents(editor, { containerElem })

    container.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))

    expect(deselected).toEqual([])

    cleanup()
    unregister()
  })

  it('does not deselect on outside mousedown when the selection is a range selection', async () => {
    await updateEditor(editor, () => {
      const paragraph = $createParagraphNode()
      paragraph.append($createTextNode('hello'))
      $getRoot().append(paragraph)
      paragraph.select()
    })
    const { deselected, unregister } = observeDeselects(editor)
    const cleanup = registerMouseEvents(editor, { containerElem })

    outside.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))

    expect(deselected).toEqual([])

    cleanup()
    unregister()
  })

  it('registers no window listener for nested editors', async () => {
    await addNodeSelectedCard(editor)
    const { deselected, unregister } = observeDeselects(editor)
    const addEventListenerSpy = vi.spyOn(window, 'addEventListener')

    const cleanup = registerMouseEvents(editor, { containerElem, isNested: true })

    expect(addEventListenerSpy.mock.calls.some(([type]) => type === 'mousedown')).toBe(false)

    outside.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    expect(deselected).toEqual([])

    cleanup()
    unregister()
  })

  it('returns early when the event target is no longer in the document', async () => {
    await addNodeSelectedCard(editor)
    const { deselected, unregister } = observeDeselects(editor)
    const cleanup = registerMouseEvents(editor, { containerElem })

    // A capture-phase listener (e.g. a dropdown closing) can detach the target
    // before the event bubbles to the window listener.
    const removeTargetOnCapture = (event: Event) => {
      ;(event.target as HTMLElement).remove()
    }
    document.addEventListener('mousedown', removeTargetOnCapture, true)
    outside.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    document.removeEventListener('mousedown', removeTargetOnCapture, true)

    expect(document.body.contains(outside)).toBe(false)
    expect(deselected).toEqual([])

    cleanup()
    unregister()
  })
})
