import type {
  DraggableInfo,
  DropResolution,
  DropResult,
} from '@kobato/inkling-internal/utils/draggable/DragDropContainer'

import { $createImageNode, $isImageNode, ImageNode } from '@kobato/inkling-internal/nodes/ImageNode'
import DragDropReorderPlugin from '@kobato/inkling-internal/plugins/DragDropReorderPlugin'
import { cardDrag, imageDrag } from '@kobato/inkling/tests/utils/draggable-fixtures'
import { updateEditor } from '@kobato/inkling/tests/utils/test-editor'
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
import { type ReactNode, type ContextType, useMemo } from 'react'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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

const ink_utils_draggable_use_drag_drop_container =
  await import('@kobato/inkling-internal/utils/draggable/use-drag-drop-container')
vi.spyOn(ink_utils_draggable_use_drag_drop_container, 'useDragDropContainer').mockImplementation(((
  options: CapturedContainerOptions,
) => {
  captured.containerOptions = options
  return { refresh: vi.fn() }
}) as never)

afterAll(() => {
  vi.restoreAllMocks()
})

const reorderRulesMod = await import('@kobato/inkling-internal/utils/draggable/reorder-rules')
vi.spyOn(reorderRulesMod, 'resolveDrop').mockImplementation(((...args: unknown[]) =>
  captured.resolveDrop(...args)) as never)

function TestWrapper({ children, editor }: { children: ReactNode; editor: LexicalEditor }) {
  const contextValue = useMemo<ContextType<typeof LexicalComposerContext>>(
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

    const result = getCapturedOnDrop()(imageDrag({ dataset: { src: '/dragged.png', width: 320, height: 180 } }), {
      insertIndex: 0,
    })

    expect(result).toBe(true)
    await settleEditor()
    editor.getEditorState().read(() => {
      const inserted = $getRoot()
        .getChildren()
        .filter($isImageNode)
        .map((node) => node.getDataset())
        .filter((dataset) => dataset.src === '/dragged.png')
      expect(inserted).toEqual([expect.objectContaining({ src: '/dragged.png', width: 320, height: 180 })])
    })
  })

  it('reports failure and leaves the tree untouched when the image insert resolves no slot', async () => {
    captured.resolveDrop.mockReturnValue({ draggableIndex: -1, droppables: [] })
    const before = readTopLevelKeys()

    const result = getCapturedOnDrop()(imageDrag({ dataset: { src: '/dragged.png' } }), {
      insertIndex: 0,
    })

    expect(result).toBe(false)
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
