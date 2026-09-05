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

import type { DraggableInfo, DropResolution, DropResult } from '@/utils/draggable/DragDropContainer'

import { updateEditor } from '#/utils/test-editor'
import { $createImageNode, ImageNode } from '@/nodes/ImageNode'
import DragDropReorderPlugin from '@/plugins/DragDropReorderPlugin'

// The plugin's onDrop result mapping, exercised through the real plugin
// component with the drag container stubbed out: useDragDropContainer is
// mocked to capture the options the plugin renders with, and reorder-rules'
// resolveDrop is mocked to control the drop-time verification scan (the
// surgery-level behavior lives in behaviour/drop-surgery.test.ts).

interface CapturedContainerOptions {
  droppable: {
    onDrop: (draggableInfo: DraggableInfo, dropResolution: DropResolution | null) => DropResult
  }
}

const captured = vi.hoisted(() => ({
  containerOptions: undefined as CapturedContainerOptions | undefined,
  resolveDrop: vi.fn(),
}))

vi.mock('@/utils/draggable/useDragDropContainer', () => ({
  useDragDropContainer: (options: CapturedContainerOptions) => {
    captured.containerOptions = options
    return { refresh: vi.fn() }
  },
}))

vi.mock('@/utils/draggable/reorder-rules', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/utils/draggable/reorder-rules')>()
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

function getCapturedOnDrop(): CapturedContainerOptions['droppable']['onDrop'] {
  if (!captured.containerOptions) {
    throw new Error('expected the plugin to have rendered its container options')
  }
  return captured.containerOptions.droppable.onDrop
}

function draggableInfo(overrides: Partial<DraggableInfo>): DraggableInfo {
  return {
    element: document.createElement('div'),
    target: null,
    mousePosition: { x: 0, y: 0 },
    dataset: {},
    ...overrides,
  }
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

    const result = getCapturedOnDrop()(draggableInfo({ type: 'image', dataset: { src: '/dragged.png' } }), {
      insertIndex: 0,
    })

    expect(result).toBe(true)
    await settleEditor()
    expect(readTopLevelKeys()).toHaveLength(before.length + 1)
  })

  it('reports failure and leaves the tree untouched when the image insert resolves no slot', async () => {
    // an empty drop-time scan gives $insertDraggedImage no slot — the drop
    // failed, and reporting failure is what keeps the source node in place
    captured.resolveDrop.mockReturnValue({ draggableIndex: -1, droppables: [] })
    const before = readTopLevelKeys()

    const result = getCapturedOnDrop()(draggableInfo({ type: 'image', dataset: { src: '/dragged.png' } }), {
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

    const result = getCapturedOnDrop()(draggableInfo({ type: 'card', nodeKey: imageKey }), { insertIndex: 0 })

    expect(result).toBe(false)
    await settleEditor()
    expect(readTopLevelKeys()).toEqual(before)
  })
})
