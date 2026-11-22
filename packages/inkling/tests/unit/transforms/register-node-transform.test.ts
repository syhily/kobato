import { ImageNode } from '@kobato/inkling-internal/nodes/ImageNode'
import { registerNodeTransformIfPresent } from '@kobato/inkling-internal/transforms/register-node-transform'
import { createTestEditor, updateEditor } from '@kobato/inkling/tests/utils/test-editor'
import { $createParagraphNode, $createTextNode, $getRoot, TextNode } from 'lexical'
import { describe, expect, it, vi } from 'vitest'

describe('registerNodeTransformIfPresent', () => {
  it('installs the transform when the node class is present', async () => {
    const editor = createTestEditor({ nodes: [TextNode] })
    const transform = vi.fn()

    registerNodeTransformIfPresent(editor, TextNode, transform)

    await updateEditor(editor, () => {
      const paragraph = $createParagraphNode()
      paragraph.append($createTextNode('x'))
      $getRoot().append(paragraph)
    })
    expect(transform).toHaveBeenCalled()
  })

  it('returns a no-op teardown when the node class is absent', () => {
    const editor = createTestEditor({ nodes: [ImageNode] })
    const transform = vi.fn()

    const teardown = registerNodeTransformIfPresent(editor, TextNode, transform)

    expect(teardown).toBeInstanceOf(Function)
    expect(transform).not.toHaveBeenCalled()
    expect(() => teardown()).not.toThrow()
  })
})
