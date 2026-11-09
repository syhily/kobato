import { LexicalComposerContext, createLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { render } from '@testing-library/react'
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  createEditor,
  type LexicalEditor,
  type NodeKey,
} from 'lexical'
import React, { useMemo } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { DraggableInfo, DropResolution, DropResult } from '@/inkling/utils/draggable/DragDropContainer'

import { cardDrag, imageDrag } from '#/inkling/utils/draggable-fixtures'
import { updateEditor } from '#/inkling/utils/test-editor'
import { $createImageNode, $isImageNode, ImageNode } from '@/inkling/nodes/ImageNode'
import DragDropReorderPlugin from '@/inkling/plugins/DragDropReorderPlugin'

// The plugin's onDrop result mapping, exercised through the real plugin
// component with the drag container stubbed out: useDragDropContainer is
// mocked to capture the options the plugin renders with, and reorder-rules'
// resolveDrop is mocked to control the drop-time verification scan (the
// surgery-level behavior lives in behaviour/drop-surgery.test.ts).

interface CapturedContainerOptions {
  droppable: {
    onDrop: (draggableInfo: DraggableInfo, dropResolution: DropResolution | null) => DropResult
  }
  lifecycle: {
    onDropEnd: (draggableInfo: DraggableInfo, success: boolean, sourceHandled: boolean) => void
  }
}

const captured = vi.hoisted(() => ({
  containerOptions: undefined as CapturedContainerOptions | undefined,
  resolveDrop: vi.fn(),
}))

vi.mock('@/inkling/utils/draggable/useDragDropContainer', () => ({
  useDragDropContainer: (options: CapturedContainerOptions) => {
    captured.containerOptions = options
    return { refresh: vi.fn() }
  },
}))

vi.mock('@/inkling/utils/draggable/reorder-rules', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/inkling/utils/draggable/reorder-rules')>()
  return {
    ...original,
    resolveDrop: (...args: unknown[]) => captured.resolveDrop(...args),
  }
})

function TestWrapper({ children, editor }: { children: React.ReactNode; editor: LexicalEditor }) {
  const contextValue = useMemo<React.ContextType<typeof LexicalComposerContext>>(
    () => [editor, createLexicalComposerContext(null, {})],
    [editor],
  )
  return <LexicalComposerContext.Provider value={contextValue}>{children}</LexicalComposerContext.Provider>
}

function captureContainerOptions(): CapturedContainerOptions {
  if (!captured.containerOptions) {
    throw new Error('expected the plugin to have rendered its container options')
  }
  return captured.containerOptions
}

function getCapturedOnDrop(): CapturedContainerOptions['droppable']['onDrop'] {
  return captureContainerOptions().droppable.onDrop
}

function getCapturedOnDropEnd(): CapturedContainerOptions['lifecycle']['onDropEnd'] {
  return captureContainerOptions().lifecycle.onDropEnd
}

// the plugin's editor.update is React-hosted, so it commits on a later tick —
// await one macrotask before asserting on the resulting editor state
function settleEditor(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0)
  })
}

describe('DragDropReorderPlugin onDrop result mapping', () => {
  let editor: LexicalEditor
  let rootElement: HTMLDivElement
  let imageKey: NodeKey

  beforeEach(async () => {
    captured.containerOptions = undefined
    captured.resolveDrop.mockReset()
    editor = createEditor({ namespace: 'test', nodes: [ImageNode], onError: () => {} })
    rootElement = document.createElement('div')
    rootElement.setAttribute('contenteditable', 'true')
    document.body.appendChild(rootElement)
    editor.setRootElement(rootElement)
    await updateEditor(editor, () => {
      const root = $getRoot()
      root.clear()
      root.append($createParagraphNode().append($createTextNode('intro')))
      const image = $createImageNode({ src: '/a.png' })
      root.append(image)
      imageKey = image.getKey()
    })
    render(
      <TestWrapper editor={editor}>
        <DragDropReorderPlugin />
      </TestWrapper>,
    )
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  function readTopLevelKeys(): NodeKey[] {
    return editor.getEditorState().read(() =>
      $getRoot()
        .getChildren()
        .map((node) => node.getKey()),
    )
  }

  it('reports the image drop as handled when the dragged image was inserted', async () => {
    const droppable = editor.getElementByKey(imageKey)
    if (!droppable) {
      throw new Error('expected a reconciled image element')
    }
    captured.resolveDrop.mockReturnValue({ draggableIndex: -1, droppables: [droppable] })
    const before = readTopLevelKeys()

    const result = getCapturedOnDrop()(imageDrag({ dataset: { src: '/dragged.png' } }), {
      insertIndex: 0,
    })

    expect(result).toBe(true)
    await settleEditor()
    expect(readTopLevelKeys()).toHaveLength(before.length + 1)
  })

  it('inserts the narrowed image payload with its dataset intact', async () => {
    const droppable = editor.getElementByKey(imageKey)
    if (!droppable) {
      throw new Error('expected a reconciled image element')
    }
    captured.resolveDrop.mockReturnValue({ draggableIndex: -1, droppables: [droppable] })

    const result = getCapturedOnDrop()(
      // the image branch carries ImageNodeDataset directly — the surgery
      // consumes it without an assertion
      imageDrag({ dataset: { src: '/dragged.png', width: 320, height: 180 } }),
      { insertIndex: 0 },
    )

    expect(result).toBe(true)
    await settleEditor()
    editor.getEditorState().read(() => {
      const inserted = $getRoot()
        .getChildren()
        .filter($isImageNode)
        .map((node) => node.getDataset())
        .filter((dataset) => dataset.src === '/dragged.png')
      // the insert surgery constructs the card from exactly the dragged dataset
      expect(inserted).toEqual([expect.objectContaining({ src: '/dragged.png', width: 320, height: 180 })])
    })
  })

  it('reports failure and leaves the tree untouched when the image insert resolves no slot', async () => {
    // an empty drop-time scan gives $insertDraggedImage no slot — the drop
    // failed, and reporting failure is what keeps the source node in place
    captured.resolveDrop.mockReturnValue({ draggableIndex: -1, droppables: [] })
    const before = readTopLevelKeys()

    const result = getCapturedOnDrop()(imageDrag({ dataset: { src: '/dragged.png' } }), {
      insertIndex: 0,
    })

    expect(result).toBe(false)
    // settle before the negative assertion too — otherwise the check would
    // pass vacuously against an update that only commits on a later tick
    await settleEditor()
    expect(readTopLevelKeys()).toEqual(before)
  })

  it('reports failure when the card relocation resolves no slot (empty drop-time scan)', async () => {
    captured.resolveDrop.mockReturnValue({ draggableIndex: -1, droppables: [] })
    const before = readTopLevelKeys()

    const result = getCapturedOnDrop()(cardDrag({ cardName: 'image', nodeKey: imageKey }), { insertIndex: 0 })

    expect(result).toBe(false)
    await settleEditor()
    expect(readTopLevelKeys()).toEqual(before)
  })

  describe('onDropEnd source-removal policy', () => {
    it('keeps the source for a successful image drag-out (images insert as new nodes)', async () => {
      const before = readTopLevelKeys()

      getCapturedOnDropEnd()(imageDrag({ dataset: { src: '/dragged.png' } }), true, false)
      await settleEditor()

      expect(readTopLevelKeys()).toEqual(before)
      expect(readTopLevelKeys()).toContain(imageKey)
    })

    it('removes the card source after a successful drop handled elsewhere', async () => {
      const before = readTopLevelKeys()

      getCapturedOnDropEnd()(cardDrag({ cardName: 'image', nodeKey: imageKey }), true, false)
      await settleEditor()

      expect(readTopLevelKeys()).not.toContain(imageKey)
      expect(readTopLevelKeys()).toHaveLength(before.length - 1)
    })

    it('keeps the card source when the target handled the drop itself (sourceHandled)', async () => {
      const before = readTopLevelKeys()

      getCapturedOnDropEnd()(cardDrag({ cardName: 'image', nodeKey: imageKey }), true, true)
      await settleEditor()

      expect(readTopLevelKeys()).toEqual(before)
    })

    it('keeps the card source when the drop failed', async () => {
      const before = readTopLevelKeys()

      getCapturedOnDropEnd()(cardDrag({ cardName: 'image', nodeKey: imageKey }), false, false)
      await settleEditor()

      expect(readTopLevelKeys()).toEqual(before)
    })
  })
})
