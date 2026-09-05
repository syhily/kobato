import { $createParagraphNode, $createTextNode, $getRoot, createEditor, type LexicalEditor } from 'lexical'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { updateEditor } from '#/utils/test-editor'
import { $createImageNode, ImageNode } from '@/nodes/ImageNode'
import { $getVisuallyAdjacentCard } from '@/plugins/behaviour/card-adjacency'

// Pins the DEFAULT CardAdjacencyGeometry implementation — the module's riskiest
// transcription (arrows.ts's `anchorNode === topLevelElement` + `children.length - 1`
// offset math), which the jsdom characterization tests never route through. Driven
// through $getVisuallyAdjacentCard('down') with no geometry injected and a stubbed
// window.getSelection(); native Selection stubbing is permitted in this file (unlike
// card-adjacency.test.ts).
const DEFAULT_GEOMETRY_TEST_NODES = [ImageNode]

function createTestEditor() {
  return createEditor({
    namespace: 'test',
    nodes: DEFAULT_GEOMETRY_TEST_NODES,
    onError: () => {},
  })
}

/** A native block element ([data-lexical-editor] > p) with two element children. */
function mountNativeBlock() {
  const container = document.createElement('div')
  container.setAttribute('data-lexical-editor', 'true')
  const block = document.createElement('p')
  block.append(document.createElement('br'), document.createElement('br'))
  container.append(block)
  document.body.appendChild(container)
  return block
}

function fakeNativeSelection(overrides: Record<string, unknown>): Selection {
  return {
    rangeCount: 1,
    anchorNode: null,
    anchorOffset: 0,
    focusOffset: 0,
    ...overrides,
  } as unknown as Selection
}

describe('default CardAdjacencyGeometry', () => {
  let editor: LexicalEditor

  beforeEach(() => {
    editor = createTestEditor()
    document.body.innerHTML = ''
  })

  afterEach(() => {
    vi.restoreAllMocks()
    document.body.innerHTML = ''
  })

  /** [paragraph("Some content")] [image] with the Lexical caret collapsed mid-text. */
  async function buildParagraphThenCard() {
    let cardKey = ''
    await updateEditor(editor, () => {
      const root = $getRoot()
      const paragraph = $createParagraphNode()
      const textNode = $createTextNode('Some content')
      paragraph.append(textNode)
      const image = $createImageNode({ src: '/image.png' })
      root.append(paragraph)
      root.append(image)
      cardKey = image.getKey()
      textNode.select(5, 5)
    })
    return { cardKey }
  }

  function read<T>(readFn: () => T): T {
    return editor.getEditorState().read(readFn)
  }

  it('isCaretAtBlockEnd is true when the native caret is at children.length - 1 of its top-level element', async () => {
    const { cardKey } = await buildParagraphThenCard()
    const block = mountNativeBlock()
    vi.spyOn(window, 'getSelection').mockReturnValue(
      fakeNativeSelection({
        anchorNode: block,
        anchorOffset: block.children.length - 1,
        focusOffset: block.children.length - 1,
        getRangeAt: () => {
          throw new Error('atEndOfElement must win before the caret-rect comparison')
        },
      }),
    )

    const card = read(() => $getVisuallyAdjacentCard('down'))
    expect(card?.getKey()).toBe(cardKey)
  })

  it('isCaretAtBlockEnd is false when the native caret is not at the last child offset', async () => {
    await buildParagraphThenCard()
    const block = mountNativeBlock()
    const getRangeAt = vi.fn(() => ({ cloneRange: () => ({ getClientRects: () => [] }) }))
    vi.spyOn(window, 'getSelection').mockReturnValue(
      fakeNativeSelection({
        anchorNode: block,
        anchorOffset: 0,
        focusOffset: 0,
        getRangeAt,
      }),
    )

    expect(read(() => $getVisuallyAdjacentCard('down'))).toBeNull()
    // the query fell through to the caret-rect comparison (which found no rects)
    expect(getRangeAt).toHaveBeenCalled()
  })

  it('isCaretAtBlockEnd is false when the native caret anchor is inside the block, not the block itself', async () => {
    await buildParagraphThenCard()
    const block = mountNativeBlock()
    const getRangeAt = vi.fn(() => ({ cloneRange: () => ({ getClientRects: () => [] }) }))
    vi.spyOn(window, 'getSelection').mockReturnValue(
      fakeNativeSelection({
        anchorNode: block.firstChild,
        anchorOffset: block.children.length - 1,
        focusOffset: block.children.length - 1,
        getRangeAt,
      }),
    )

    expect(read(() => $getVisuallyAdjacentCard('down'))).toBeNull()
    expect(getRangeAt).toHaveBeenCalled()
  })

  it('isCaretAtBlockEnd is false when the native selection has no ranges', async () => {
    await buildParagraphThenCard()
    const block = mountNativeBlock()
    vi.spyOn(window, 'getSelection').mockReturnValue(
      fakeNativeSelection({
        rangeCount: 0,
        anchorNode: block,
        anchorOffset: block.children.length - 1,
        focusOffset: block.children.length - 1,
        getRangeAt: () => {
          throw new Error('rangeCount === 0 must guard the caret-rect read too')
        },
      }),
    )

    expect(read(() => $getVisuallyAdjacentCard('down'))).toBeNull()
  })
})
