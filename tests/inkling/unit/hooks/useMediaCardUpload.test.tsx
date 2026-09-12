import { act, render } from '@testing-library/react'
import { $getRoot, type LexicalEditor, type LexicalNode, type NodeKey } from 'lexical'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { mockComposerContext } from '#/inkling/utils/composer-context'
import { createHostIntegrationValue } from '#/inkling/utils/host-integration-context'
import { createTestEditor, tick, updateEditor } from '#/inkling/utils/test-editor'
import { InklingHostIntegrationProvider } from '@/inkling/context/InklingHostIntegrationContext'
import { useMediaCardUpload, type UseMediaCardUploadOptions } from '@/inkling/hooks/useMediaCardUpload'
import { $isFileNode } from '@/inkling/nodes/FileNode'
import { $createImageNode, $isImageNode, ImageNode } from '@/inkling/nodes/ImageNode'

vi.mock('@lexical/react/LexicalComposerContext', () => ({
  useLexicalComposerContext: vi.fn(),
}))

function Harness({ nodeKey, guard }: { nodeKey: NodeKey; guard: (node: unknown) => node is LexicalNode }) {
  const { fileInputRef } = useMediaCardUpload({
    kind: 'image',
    nodeKey,
    guard,
    triggerFileDialog: true,
    onFiles: vi.fn(),
  })
  return <input type="file" ref={fileInputRef} />
}

async function insertImageNode(editor: LexicalEditor): Promise<NodeKey> {
  let nodeKey: NodeKey = ''
  await updateEditor(editor, () => {
    const node = $createImageNode({ triggerFileDialog: true })
    $getRoot().append(node)
    nodeKey = node.getKey()
  })
  return nodeKey
}

function readTriggerFlag(editor: LexicalEditor): boolean | undefined {
  return editor.getEditorState().read(() => {
    const node = $getRoot().getFirstChildOrThrow()
    return $isImageNode(node) ? node.triggerFileDialog : undefined
  })
}

describe('useMediaCardUpload', () => {
  let editor: LexicalEditor

  beforeEach(() => {
    editor = createTestEditor({ nodes: [ImageNode] })
    mockComposerContext(editor)
  })

  it('opens the picker and clears the node flag through the matching guard', async () => {
    const nodeKey = await insertImageNode(editor)
    const { container } = render(
      <InklingHostIntegrationProvider value={createHostIntegrationValue()}>
        <Harness nodeKey={nodeKey} guard={$isImageNode} />
      </InklingHostIntegrationProvider>,
    )
    const clickSpy = vi.spyOn(container.querySelector('input')!, 'click')

    // the dialog trigger defers the click + flag clear behind a setTimeout
    await act(async () => {
      await tick()
    })

    expect(clickSpy).toHaveBeenCalledTimes(1)
    expect(readTriggerFlag(editor)).toBe(false)
  })

  it('leaves the node flag alone when the guard does not match the node', async () => {
    const nodeKey = await insertImageNode(editor)
    const { container } = render(
      <InklingHostIntegrationProvider value={createHostIntegrationValue()}>
        <Harness nodeKey={nodeKey} guard={$isFileNode} />
      </InklingHostIntegrationProvider>,
    )
    const clickSpy = vi.spyOn(container.querySelector('input')!, 'click')

    await act(async () => {
      await tick()
    })

    expect(clickSpy).toHaveBeenCalledTimes(1)
    expect(readTriggerFlag(editor)).toBe(true)
  })

  it('types the options guard as a type predicate, not a boolean guard (audit §4-6)', () => {
    const booleanGuard = (node: unknown) => node !== null
    const options: UseMediaCardUploadOptions<ImageNode> = {
      kind: 'image',
      nodeKey: 'key',
      // @ts-expect-error -- a boolean guard never narrows; the options boundary only accepts real predicates
      guard: booleanGuard,
      onFiles: vi.fn(),
    }
    expect(options.guard).toBe(booleanGuard)
  })
})
