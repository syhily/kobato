import { act, renderHook } from '@testing-library/react'
import { $getRoot, createEditor, type LexicalEditor, type NodeKey } from 'lexical'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { mockComposerContext } from '#/utils/composer-context'
import { useCardWriter } from '@/hooks/useCardWriter'
import { $isHtmlNode, HtmlNode } from '@/nodes/HtmlNode'
import { $isImageNode } from '@/nodes/ImageNode'

vi.mock('@lexical/react/LexicalComposerContext', () => ({
  useLexicalComposerContext: vi.fn(),
}))

function createTestEditor(): LexicalEditor {
  return createEditor({ namespace: 'test', nodes: [HtmlNode], onError: () => {} })
}

function addHtmlNode(editor: LexicalEditor): Promise<NodeKey> {
  return new Promise((resolve) => {
    editor.update(
      () => {
        $getRoot().append(new HtmlNode({ html: '<p>Hello</p>' }))
      },
      { onUpdate: () => resolve(editor.getEditorState().read(() => $getRoot().getFirstChildOrThrow().getKey())) },
    )
  })
}

// a root-less editor commits its update on a microtask, so flush before
// reading the state back
async function flushCommit() {
  await act(async () => {})
}

describe('useCardWriter', () => {
  let editor: LexicalEditor

  beforeEach(() => {
    editor = createTestEditor()
    mockComposerContext(editor)
  })

  it('runs the mutator against the guarded node inside editor.update', async () => {
    const nodeKey = await addHtmlNode(editor)
    const updateSpy = vi.spyOn(editor, 'update')
    const { result } = renderHook(() => useCardWriter(nodeKey, $isHtmlNode))

    result.current((node) => {
      node.html = '<p>changed</p>'
    })

    expect(updateSpy).toHaveBeenCalledTimes(1)
    await flushCommit()
    expect(
      editor.getEditorState().read(() => {
        const first = $getRoot().getFirstChildOrThrow()
        return $isHtmlNode(first) ? first.html : null
      }),
    ).toBe('<p>changed</p>')
  })

  it('no-ops when the guard does not match the node', async () => {
    const nodeKey = await addHtmlNode(editor)
    const mutator = vi.fn()
    const { result } = renderHook(() => useCardWriter(nodeKey, $isImageNode))

    result.current(mutator)

    await flushCommit()
    expect(mutator).not.toHaveBeenCalled()
    expect(
      editor.getEditorState().read(() => {
        const first = $getRoot().getFirstChildOrThrow()
        return $isHtmlNode(first) ? first.html : null
      }),
    ).toBe('<p>Hello</p>')
  })
})
