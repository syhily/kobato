import {
  $createParagraphNode,
  $createTextNode,
  $getNodeByKey,
  $getRoot,
  $getSelection,
  $isNodeSelection,
  $isParagraphNode,
  $isRangeSelection,
  createEditor,
  type LexicalEditor,
  type LexicalNode,
  type LexicalNodeConfig,
} from 'lexical'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { CardNode } from '#/utils/card-node'

import { updateEditor } from '#/utils/test-editor'
import { $createMarkdownNode, MarkdownNode } from '@/nodes/base'
import { $createImageNode, ImageNode } from '@/nodes/ImageNode'
import {
  $deselectCard,
  $getLogicallyAdjacentCard,
  $getVisuallyAdjacentCard,
  $isCaretAtBlockTop,
  $removeOrReplaceNodeWithParagraph,
  $selectCard,
  dispatchSelectedCardDeletion,
  editorOwnsFocus,
  type CardAdjacencyGeometry,
} from '@/plugins/behaviour/card-adjacency'
import { createCardSelectionStore } from '@/plugins/behaviour/cardSelectionStore'
import { DELETE_CARD_COMMAND } from '@/plugins/behaviour/commands'
import { $selectDecoratorNode } from '@/utils'

// Minimal node set: one card type is enough to exercise adjacency in jsdom.
const CARD_ADJACENCY_TEST_NODES = [ImageNode]

function createTestEditor(nodes: LexicalNodeConfig[] = CARD_ADJACENCY_TEST_NODES) {
  return createEditor({
    namespace: 'test',
    nodes,
    onError: () => {},
  })
}

/**
 * Fake geometry whose every member throws unless overridden, so a test fails
 * if the queries read geometry they should not need (e.g. caret rects on the
 * empty-paragraph shortcut path).
 */
function fakeGeometry(overrides: Partial<CardAdjacencyGeometry> = {}): CardAdjacencyGeometry {
  const unexpected = (name: string) => () => {
    throw new Error(`unexpected geometry read: ${name}`)
  }
  return {
    hasNativeSelection: unexpected('hasNativeSelection'),
    getCaretClientRects: unexpected('getCaretClientRects'),
    getTopLevelBlockRect: unexpected('getTopLevelBlockRect'),
    isCaretAtBlockTop: unexpected('isCaretAtBlockTop'),
    isCaretAtBlockEnd: unexpected('isCaretAtBlockEnd'),
    ...overrides,
  }
}

function fakeRect(top: number, bottom: number): DOMRect {
  return {
    bottom,
    height: bottom - top,
    left: 0,
    right: 0,
    top,
    width: 0,
    x: 0,
    y: top,
    toJSON: () => ({}),
  } as DOMRect
}

describe('card-adjacency', () => {
  let editor: LexicalEditor

  beforeEach(() => {
    editor = createTestEditor()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  /** [image] [paragraph("Some content")] with the caret in the text at `offset`. */
  async function buildCardThenParagraph(offset: number) {
    let cardKey = ''
    await updateEditor(editor, () => {
      const root = $getRoot()
      const image = $createImageNode({ src: '/image.png' })
      const paragraph = $createParagraphNode()
      const textNode = $createTextNode('Some content')
      paragraph.append(textNode)
      root.append(image)
      root.append(paragraph)
      cardKey = image.getKey()
      textNode.select(offset, offset)
    })
    return { cardKey }
  }

  /** [paragraph("Some content")] [image] with the caret in the text at `offset`. */
  async function buildParagraphThenCard(offset: number) {
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
      textNode.select(offset, offset)
    })
    return { cardKey }
  }

  /** [image] [empty paragraph] [image] with the caret in the paragraph. */
  async function buildEmptyParagraphBetweenCards() {
    let previousCardKey = ''
    let nextCardKey = ''
    await updateEditor(editor, () => {
      const root = $getRoot()
      const previousImage = $createImageNode({ src: '/previous.png' })
      const paragraph = $createParagraphNode()
      const nextImage = $createImageNode({ src: '/next.png' })
      root.append(previousImage)
      root.append(paragraph)
      root.append(nextImage)
      previousCardKey = previousImage.getKey()
      nextCardKey = nextImage.getKey()
      paragraph.selectStart()
    })
    return { previousCardKey, nextCardKey }
  }

  function read<T>(readFn: () => T): T {
    return editor.getEditorState().read(readFn)
  }

  describe("$getVisuallyAdjacentCard 'up'", () => {
    it('returns the previous card from the empty-paragraph shortcut without reading geometry', async () => {
      const { previousCardKey } = await buildEmptyParagraphBetweenCards()

      const card = read(() => $getVisuallyAdjacentCard('up', fakeGeometry()))
      expect(card?.getKey()).toBe(previousCardKey)
    })

    it('returns the previous card at offset 0 of a populated paragraph without reading geometry', async () => {
      const { cardKey } = await buildCardThenParagraph(0)

      const card = read(() => $getVisuallyAdjacentCard('up', fakeGeometry()))
      expect(card?.getKey()).toBe(cardKey)
    })

    it('returns the previous card when the caret is on the first visual line', async () => {
      const { cardKey } = await buildCardThenParagraph(5)
      const geometry = fakeGeometry({ isCaretAtBlockTop: () => true })

      const card = read(() => $getVisuallyAdjacentCard('up', geometry))
      expect(card?.getKey()).toBe(cardKey)
    })

    it('returns null when the caret is below the first visual line', async () => {
      await buildCardThenParagraph(5)
      const geometry = fakeGeometry({ isCaretAtBlockTop: () => false })

      const card = read(() => $getVisuallyAdjacentCard('up', geometry))
      expect(card).toBeNull()
    })

    it('returns null when the previous sibling is not a card', async () => {
      await updateEditor(editor, () => {
        const root = $getRoot()
        const first = $createParagraphNode()
        first.append($createTextNode('first'))
        const second = $createParagraphNode()
        const textNode = $createTextNode('second')
        second.append(textNode)
        root.append(first)
        root.append(second)
        textNode.select(0, 0)
      })

      const card = read(() => $getVisuallyAdjacentCard('up', fakeGeometry()))
      expect(card).toBeNull()
    })

    it('returns the previous card without a native selection (arrow up shortcuts run regardless)', async () => {
      const { previousCardKey } = await buildEmptyParagraphBetweenCards()
      const geometry = fakeGeometry({ hasNativeSelection: () => false })

      const card = read(() => $getVisuallyAdjacentCard('up', geometry))
      expect(card?.getKey()).toBe(previousCardKey)
    })

    it('uses the default DOM geometry when none is injected', async () => {
      const { previousCardKey } = await buildEmptyParagraphBetweenCards()

      const card = read(() => $getVisuallyAdjacentCard('up'))
      expect(card?.getKey()).toBe(previousCardKey)
    })
  })

  describe("$getVisuallyAdjacentCard 'down'", () => {
    it('returns the next card from the empty-paragraph shortcut without reading caret rects', async () => {
      const { nextCardKey } = await buildEmptyParagraphBetweenCards()
      const geometry = fakeGeometry({
        hasNativeSelection: () => true,
        isCaretAtBlockEnd: () => false,
      })

      const card = read(() => $getVisuallyAdjacentCard('down', geometry))
      expect(card?.getKey()).toBe(nextCardKey)
    })

    it('returns the next card when the native caret is at the end of its block element', async () => {
      const { cardKey } = await buildParagraphThenCard(5)
      const geometry = fakeGeometry({
        hasNativeSelection: () => true,
        isCaretAtBlockEnd: () => true,
      })

      const card = read(() => $getVisuallyAdjacentCard('down', geometry))
      expect(card?.getKey()).toBe(cardKey)
    })

    it('returns null without a native selection, even on an empty paragraph (arrow down ordering)', async () => {
      await buildEmptyParagraphBetweenCards()
      const geometry = fakeGeometry({ hasNativeSelection: () => false })

      const card = read(() => $getVisuallyAdjacentCard('down', geometry))
      expect(card).toBeNull()
    })

    it('returns the next card when the caret is on the last visual line', async () => {
      const { cardKey } = await buildParagraphThenCard(5)
      const geometry = fakeGeometry({
        hasNativeSelection: () => true,
        isCaretAtBlockEnd: () => false,
        getCaretClientRects: () => [fakeRect(90, 100)],
        getTopLevelBlockRect: () => fakeRect(0, 100),
      })

      const card = read(() => $getVisuallyAdjacentCard('down', geometry))
      expect(card?.getKey()).toBe(cardKey)
    })

    it('returns the next card when the caret is within the threshold of the last line', async () => {
      const { cardKey } = await buildParagraphThenCard(5)
      const geometry = fakeGeometry({
        hasNativeSelection: () => true,
        isCaretAtBlockEnd: () => false,
        getCaretClientRects: () => [fakeRect(81, 95)],
        getTopLevelBlockRect: () => fakeRect(0, 100),
      })

      const card = read(() => $getVisuallyAdjacentCard('down', geometry))
      expect(card?.getKey()).toBe(cardKey)
    })

    it('returns null when the caret is exactly the threshold distance from the last line (strict <)', async () => {
      await buildParagraphThenCard(5)
      const geometry = fakeGeometry({
        hasNativeSelection: () => true,
        isCaretAtBlockEnd: () => false,
        getCaretClientRects: () => [fakeRect(80, 90)],
        getTopLevelBlockRect: () => fakeRect(0, 100),
      })

      const card = read(() => $getVisuallyAdjacentCard('down', geometry))
      expect(card).toBeNull()
    })

    it('uses the second caret rect when the caret reports two rects', async () => {
      const { cardKey } = await buildParagraphThenCard(5)
      const geometry = fakeGeometry({
        hasNativeSelection: () => true,
        isCaretAtBlockEnd: () => false,
        getCaretClientRects: () => [fakeRect(0, 40), fakeRect(90, 100)],
        getTopLevelBlockRect: () => fakeRect(0, 100),
      })

      const card = read(() => $getVisuallyAdjacentCard('down', geometry))
      expect(card?.getKey()).toBe(cardKey)
    })

    it('ignores the first caret rect when the caret reports two rects', async () => {
      await buildParagraphThenCard(5)
      const geometry = fakeGeometry({
        hasNativeSelection: () => true,
        isCaretAtBlockEnd: () => false,
        getCaretClientRects: () => [fakeRect(90, 100), fakeRect(0, 40)],
        getTopLevelBlockRect: () => fakeRect(0, 100),
      })

      const card = read(() => $getVisuallyAdjacentCard('down', geometry))
      expect(card).toBeNull()
    })

    it('returns null when the caret has no client rects', async () => {
      await buildParagraphThenCard(5)
      const geometry = fakeGeometry({
        hasNativeSelection: () => true,
        isCaretAtBlockEnd: () => false,
        getCaretClientRects: () => [],
      })

      const card = read(() => $getVisuallyAdjacentCard('down', geometry))
      expect(card).toBeNull()
    })

    it('returns null when the block rect is unavailable', async () => {
      await buildParagraphThenCard(5)
      const geometry = fakeGeometry({
        hasNativeSelection: () => true,
        isCaretAtBlockEnd: () => false,
        getCaretClientRects: () => [fakeRect(90, 100)],
        getTopLevelBlockRect: () => null,
      })

      const card = read(() => $getVisuallyAdjacentCard('down', geometry))
      expect(card).toBeNull()
    })

    it('returns null when the next sibling is not a card', async () => {
      await updateEditor(editor, () => {
        const root = $getRoot()
        const first = $createParagraphNode()
        const textNode = $createTextNode('first')
        first.append(textNode)
        const second = $createParagraphNode()
        second.append($createTextNode('second'))
        root.append(first)
        root.append(second)
        textNode.select(2, 2)
      })

      const card = read(() => $getVisuallyAdjacentCard('down', fakeGeometry()))
      expect(card).toBeNull()
    })
  })

  describe('$getVisuallyAdjacentCard selection guards', () => {
    it('returns null for a node selection', async () => {
      await updateEditor(editor, () => {
        const root = $getRoot()
        const image = $createImageNode({ src: '/image.png' })
        const nextImage = $createImageNode({ src: '/next.png' })
        root.append(image)
        root.append(nextImage)
        $selectDecoratorNode(image)
      })

      expect(read(() => $getVisuallyAdjacentCard('down', fakeGeometry()))).toBeNull()
      expect(read(() => $getVisuallyAdjacentCard('up', fakeGeometry()))).toBeNull()
    })

    it('returns null when the selection is not collapsed', async () => {
      await updateEditor(editor, () => {
        const root = $getRoot()
        const paragraph = $createParagraphNode()
        const textNode = $createTextNode('Some content')
        paragraph.append(textNode)
        root.append(paragraph)
        root.append($createImageNode({ src: '/image.png' }))
        textNode.select(0, 5)
      })

      expect(read(() => $getVisuallyAdjacentCard('down', fakeGeometry()))).toBeNull()
    })
  })

  describe('$getLogicallyAdjacentCard anchored on the selection', () => {
    it('returns the previous card when the anchor is at the start of its top-level element', async () => {
      const { cardKey } = await buildCardThenParagraph(0)

      const card = read(() => $getLogicallyAdjacentCard('previous'))
      expect(card?.getKey()).toBe(cardKey)
    })

    it('returns the previous card for an element anchor at offset 0', async () => {
      let cardKey = ''
      await updateEditor(editor, () => {
        const root = $getRoot()
        const image = $createImageNode({ src: '/image.png' })
        const paragraph = $createParagraphNode()
        paragraph.append($createTextNode('Some content'))
        root.append(image)
        root.append(paragraph)
        cardKey = image.getKey()
        paragraph.selectStart()
      })

      const card = read(() => $getLogicallyAdjacentCard('previous'))
      expect(card?.getKey()).toBe(cardKey)
    })

    it('returns null when the anchor is past the start of its top-level element', async () => {
      await buildCardThenParagraph(3)

      const card = read(() => $getLogicallyAdjacentCard('previous'))
      expect(card).toBeNull()
    })

    it('returns the next card when the anchor text ends its top-level element', async () => {
      const { cardKey } = await buildParagraphThenCard('Some content'.length)

      const card = read(() => $getLogicallyAdjacentCard('next'))
      expect(card?.getKey()).toBe(cardKey)
    })

    it('returns the next card for an element anchor at the end of its children', async () => {
      let cardKey = ''
      await updateEditor(editor, () => {
        const root = $getRoot()
        const paragraph = $createParagraphNode()
        paragraph.append($createTextNode('Some content'))
        const image = $createImageNode({ src: '/image.png' })
        root.append(paragraph)
        root.append(image)
        cardKey = image.getKey()
        paragraph.selectEnd()
      })

      const card = read(() => $getLogicallyAdjacentCard('next'))
      expect(card?.getKey()).toBe(cardKey)
    })

    it('returns null when the anchor is mid-element', async () => {
      await buildParagraphThenCard(5)

      const card = read(() => $getLogicallyAdjacentCard('next'))
      expect(card).toBeNull()
    })

    it('returns null when the anchor text node is not the last child of its parent', async () => {
      await updateEditor(editor, () => {
        const root = $getRoot()
        const paragraph = $createParagraphNode()
        const firstText = $createTextNode('first')
        paragraph.append(firstText)
        paragraph.append($createTextNode('second'))
        const image = $createImageNode({ src: '/image.png' })
        root.append(paragraph)
        root.append(image)
        firstText.select(5, 5)
      })

      const card = read(() => $getLogicallyAdjacentCard('next'))
      expect(card).toBeNull()
    })

    it('returns null for a node selection', async () => {
      await updateEditor(editor, () => {
        const root = $getRoot()
        const image = $createImageNode({ src: '/image.png' })
        const nextImage = $createImageNode({ src: '/next.png' })
        root.append(image)
        root.append(nextImage)
        root.append($createParagraphNode())
        $selectDecoratorNode(image)
      })

      const card = read(() => $getLogicallyAdjacentCard('next'))
      expect(card).toBeNull()
    })

    it('returns null when the selection is not collapsed', async () => {
      await updateEditor(editor, () => {
        const root = $getRoot()
        const paragraph = $createParagraphNode()
        const textNode = $createTextNode('Some content')
        paragraph.append(textNode)
        root.append(paragraph)
        root.append($createImageNode({ src: '/image.png' }))
        textNode.select(0, 5)
      })

      const card = read(() => $getLogicallyAdjacentCard('next'))
      expect(card).toBeNull()
    })

    it('returns null when the sibling in the direction is not a card', async () => {
      await updateEditor(editor, () => {
        const root = $getRoot()
        const first = $createParagraphNode()
        const textNode = $createTextNode('first')
        first.append(textNode)
        const second = $createParagraphNode()
        second.append($createTextNode('second'))
        root.append(first)
        root.append(second)
        textNode.select(5, 5)
      })

      const card = read(() => $getLogicallyAdjacentCard('next'))
      expect(card).toBeNull()
    })
  })

  describe('$getLogicallyAdjacentCard anchored on a given node', () => {
    it('returns the previous card sibling without selection offset gates', async () => {
      let cardKey = ''
      let paragraphNode: LexicalNode | null = null
      await updateEditor(editor, () => {
        const root = $getRoot()
        const image = $createImageNode({ src: '/image.png' })
        const paragraph = $createParagraphNode()
        const textNode = $createTextNode('Some content')
        paragraph.append(textNode)
        root.append(image)
        root.append(paragraph)
        cardKey = image.getKey()
        paragraphNode = paragraph
        // caret mid-text: the selection-anchored mode stays gated...
        textNode.select(5, 5)
      })

      expect(read(() => $getLogicallyAdjacentCard('previous'))).toBeNull()
      // ...while the same block passed explicitly is an ungated sibling lookup
      const card = read(() => $getLogicallyAdjacentCard('previous', paragraphNode!))
      expect(card?.getKey()).toBe(cardKey)
    })

    it('returns the next card sibling and null for a non-card sibling', async () => {
      let cardKey = ''
      let paragraphNode: LexicalNode | null = null
      let imageNode: LexicalNode | null = null
      await updateEditor(editor, () => {
        const root = $getRoot()
        const paragraph = $createParagraphNode()
        paragraph.append($createTextNode('Some content'))
        const image = $createImageNode({ src: '/image.png' })
        root.append(paragraph)
        root.append(image)
        cardKey = image.getKey()
        paragraphNode = paragraph
        imageNode = image
      })

      const card = read(() => $getLogicallyAdjacentCard('next', paragraphNode!))
      expect(card?.getKey()).toBe(cardKey)
      // the image's next sibling does not exist and its previous sibling is a paragraph
      expect(read(() => $getLogicallyAdjacentCard('next', imageNode!))).toBeNull()
      expect(read(() => $getLogicallyAdjacentCard('previous', imageNode!))).toBeNull()
    })
  })

  describe('$isCaretAtBlockTop', () => {
    it('returns the geometry verdict', () => {
      expect($isCaretAtBlockTop(fakeGeometry({ isCaretAtBlockTop: () => true }))).toBe(true)
      expect($isCaretAtBlockTop(fakeGeometry({ isCaretAtBlockTop: () => false }))).toBe(false)
    })
  })

  describe('editorOwnsFocus', () => {
    it('returns true when the editor root element is the active element', () => {
      const root = document.createElement('div')
      editor.setRootElement(root)
      vi.spyOn(document, 'activeElement', 'get').mockReturnValue(root)

      expect(editorOwnsFocus(editor)).toBe(true)
    })

    it('returns false when another element has focus', () => {
      const root = document.createElement('div')
      editor.setRootElement(root)
      vi.spyOn(document, 'activeElement', 'get').mockReturnValue(document.body)

      expect(editorOwnsFocus(editor)).toBe(false)
    })

    it('returns false when the editor has no root element', () => {
      expect(editorOwnsFocus(editor)).toBe(false)
    })
  })

  describe('$removeOrReplaceNodeWithParagraph', () => {
    it('appends and selects a paragraph when the node is the last child', async () => {
      let cardKey = ''
      await updateEditor(editor, () => {
        const image = $createImageNode({ src: '/image.png' })
        $getRoot().append(image)
        cardKey = image.getKey()
      })

      await updateEditor(editor, () => {
        $removeOrReplaceNodeWithParagraph(editor, $getRoot().getFirstChild() as CardNode)
      })

      read(() => {
        const root = $getRoot()
        expect(root.getChildrenSize()).toBe(1)
        const paragraph = root.getFirstChild()
        expect($isParagraphNode(paragraph)).toBe(true)
        const selection = $getSelection()
        expect($isRangeSelection(selection)).toBe(true)
        if ($isRangeSelection(selection)) {
          expect(selection.anchor.getNode().is(paragraph)).toBe(true)
        }
        expect($getNodeByKey(cardKey)).toBeNull()
      })
    })

    it('selects the next sibling and focuses the root when the next sibling is a card', async () => {
      const root = document.createElement('div')
      editor.setRootElement(root)
      const focusSpy = vi.spyOn(root, 'focus')

      let cardKey = ''
      let nextCardKey = ''
      await updateEditor(editor, () => {
        const rootNode = $getRoot()
        const image = $createImageNode({ src: '/image.png' })
        const nextImage = $createImageNode({ src: '/next.png' })
        rootNode.append(image)
        rootNode.append(nextImage)
        cardKey = image.getKey()
        nextCardKey = nextImage.getKey()
      })

      await updateEditor(editor, () => {
        $removeOrReplaceNodeWithParagraph(editor, $getRoot().getFirstChild() as CardNode)
      })

      read(() => {
        expect($getRoot().getChildrenSize()).toBe(1)
        const selection = $getSelection()
        expect($isNodeSelection(selection)).toBe(true)
        if ($isNodeSelection(selection)) {
          expect(selection.has(nextCardKey)).toBe(true)
        }
        expect($getNodeByKey(cardKey)).toBeNull()
      })
      // decorator-next focus repair, never scrolling the viewport
      expect(focusSpy).toHaveBeenCalledWith({ preventScroll: true })
    })

    it('selects the start of the next sibling when it is not a card', async () => {
      let cardKey = ''
      await updateEditor(editor, () => {
        const root = $getRoot()
        const image = $createImageNode({ src: '/image.png' })
        const paragraph = $createParagraphNode()
        paragraph.append($createTextNode('Some content'))
        root.append(image)
        root.append(paragraph)
        cardKey = image.getKey()
      })

      await updateEditor(editor, () => {
        $removeOrReplaceNodeWithParagraph(editor, $getRoot().getFirstChild() as CardNode)
      })

      read(() => {
        expect($getRoot().getChildrenSize()).toBe(1)
        const selection = $getSelection()
        expect($isRangeSelection(selection)).toBe(true)
        if ($isRangeSelection(selection)) {
          expect(selection.anchor.offset).toBe(0)
          expect(selection.anchor.getNode().getTextContent()).toBe('Some content')
        }
        expect($getNodeByKey(cardKey)).toBeNull()
      })
    })
  })

  describe('$removeOrReplaceNodeWithParagraph with root-first focus', () => {
    it('focuses the root (preventScroll) before removing, and skips the decorator-next focus', async () => {
      const root = document.createElement('div')
      editor.setRootElement(root)
      const focusSpy = vi.spyOn(root, 'focus')

      let cardKey = ''
      let nextCardKey = ''
      await updateEditor(editor, () => {
        const rootNode = $getRoot()
        const image = $createImageNode({ src: '/image.png' })
        const nextImage = $createImageNode({ src: '/next.png' })
        rootNode.append(image)
        rootNode.append(nextImage)
        cardKey = image.getKey()
        nextCardKey = nextImage.getKey()
      })

      await updateEditor(editor, () => {
        $removeOrReplaceNodeWithParagraph(editor, $getRoot().getFirstChild() as CardNode, { focus: 'root-first' })
      })

      // exactly one focus call: the root-first one, with preventScroll
      expect(focusSpy).toHaveBeenCalledTimes(1)
      expect(focusSpy).toHaveBeenCalledWith({ preventScroll: true })
      read(() => {
        const selection = $getSelection()
        expect($isNodeSelection(selection)).toBe(true)
        if ($isNodeSelection(selection)) {
          expect(selection.has(nextCardKey)).toBe(true)
        }
        expect($getNodeByKey(cardKey)).toBeNull()
      })
    })
  })

  describe('dispatchSelectedCardDeletion', () => {
    function setup({ focused = true }: { focused?: boolean } = {}) {
      const root = document.createElement('div')
      editor.setRootElement(root)
      vi.spyOn(document, 'activeElement', 'get').mockReturnValue(focused ? root : document.body)

      const store = createCardSelectionStore()
      const dispatched: Array<{ cardKey: string; direction?: string }> = []
      editor.registerCommand(
        DELETE_CARD_COMMAND,
        (payload) => {
          dispatched.push(payload)
          return true
        },
        0,
      )
      return { store, dispatched }
    }

    it('dispatches DELETE_CARD_COMMAND with the direction and preventDefaults the event', () => {
      const { store, dispatched } = setup()
      store.setState({ selectedCardKey: 'card-1' })
      const event = new KeyboardEvent('keydown')
      const preventSpy = vi.spyOn(event, 'preventDefault')

      expect(dispatchSelectedCardDeletion(editor, store, false, 'backward', event)).toBe(true)
      expect(dispatched).toEqual([{ cardKey: 'card-1', direction: 'backward' }])
      expect(preventSpy).toHaveBeenCalledTimes(1)
    })

    it('claims the key without an event (delete-line payload)', () => {
      const { store, dispatched } = setup()
      store.setState({ selectedCardKey: 'card-1' })

      expect(dispatchSelectedCardDeletion(editor, store, false, 'forward')).toBe(true)
      expect(dispatched).toEqual([{ cardKey: 'card-1', direction: 'forward' }])
    })

    it('passes through when no card is selected', () => {
      const { dispatched } = setup()
      expect(dispatchSelectedCardDeletion(editor, createCardSelectionStore(), false, 'backward')).toBe(false)
      expect(dispatched).toEqual([])
    })

    it('passes through in nested editors', () => {
      const { store, dispatched } = setup()
      store.setState({ selectedCardKey: 'card-1' })
      expect(dispatchSelectedCardDeletion(editor, store, true, 'backward')).toBe(false)
      expect(dispatched).toEqual([])
    })

    it('passes through when the editor does not own focus', () => {
      const { store, dispatched } = setup({ focused: false })
      store.setState({ selectedCardKey: 'card-1' })
      expect(dispatchSelectedCardDeletion(editor, store, false, 'backward')).toBe(false)
      expect(dispatched).toEqual([])
    })
  })

  describe('$selectCard', () => {
    async function buildSingleCard() {
      let cardKey = ''
      await updateEditor(editor, () => {
        const image = $createImageNode({ src: '/image.png' })
        $getRoot().append(image)
        cardKey = image.getKey()
      })
      return cardKey
    }

    it('sets a node selection containing the card', async () => {
      const cardKey = await buildSingleCard()

      await updateEditor(editor, () => {
        $selectCard(editor, cardKey)
      })

      read(() => {
        const selection = $getSelection()
        expect($isNodeSelection(selection)).toBe(true)
        if ($isNodeSelection(selection)) {
          expect(selection.has(cardKey)).toBe(true)
        }
      })
    })

    it('focuses the root element when it is not the active element', async () => {
      const root = document.createElement('div')
      editor.setRootElement(root)
      const focusSpy = vi.spyOn(root, 'focus')
      const cardKey = await buildSingleCard()

      await updateEditor(editor, () => {
        $selectCard(editor, cardKey)
      })

      expect(focusSpy).toHaveBeenCalledWith({ preventScroll: true })
    })

    it('does not focus the root element when it is already the active element', async () => {
      const root = document.createElement('div')
      editor.setRootElement(root)
      vi.spyOn(document, 'activeElement', 'get').mockReturnValue(root)
      const focusSpy = vi.spyOn(root, 'focus')
      const cardKey = await buildSingleCard()

      await updateEditor(editor, () => {
        $selectCard(editor, cardKey)
      })

      expect(focusSpy).not.toHaveBeenCalled()
    })
  })

  describe('$deselectCard', () => {
    beforeEach(() => {
      editor = createTestEditor([ImageNode, MarkdownNode])
    })

    it('removes an empty card via $removeOrReplaceNodeWithParagraph', async () => {
      let cardKey = ''
      await updateEditor(editor, () => {
        const markdown = $createMarkdownNode()
        $getRoot().append(markdown)
        cardKey = markdown.getKey()
      })

      await updateEditor(editor, () => {
        $deselectCard(editor, cardKey)
      })

      read(() => {
        expect($getNodeByKey(cardKey)).toBeNull()
        const root = $getRoot()
        expect(root.getChildrenSize()).toBe(1)
        expect($isParagraphNode(root.getFirstChild())).toBe(true)
      })
    })

    it('keeps a non-empty card', async () => {
      let cardKey = ''
      await updateEditor(editor, () => {
        const markdown = $createMarkdownNode({ markdown: 'Some content' })
        $getRoot().append(markdown)
        cardKey = markdown.getKey()
      })

      await updateEditor(editor, () => {
        $deselectCard(editor, cardKey)
      })

      read(() => {
        expect($getNodeByKey(cardKey)).not.toBeNull()
      })
    })

    it('does nothing for a card without an isEmpty method', async () => {
      let cardKey = ''
      await updateEditor(editor, () => {
        const image = $createImageNode({ src: '/image.png' })
        $getRoot().append(image)
        cardKey = image.getKey()
      })

      await updateEditor(editor, () => {
        $deselectCard(editor, cardKey)
      })

      read(() => {
        expect($getNodeByKey(cardKey)).not.toBeNull()
      })
    })

    it('does nothing for a stale key that resolves to no node', async () => {
      await updateEditor(editor, () => {
        const paragraph = $createParagraphNode()
        paragraph.append($createTextNode('Some content'))
        $getRoot().append(paragraph)
      })

      await updateEditor(editor, () => {
        expect(() => $deselectCard(editor, 'stale-key')).not.toThrow()
      })

      read(() => {
        const root = $getRoot()
        expect(root.getChildrenSize()).toBe(1)
        expect(root.getFirstChild()?.getTextContent()).toBe('Some content')
      })
    })
  })
})
