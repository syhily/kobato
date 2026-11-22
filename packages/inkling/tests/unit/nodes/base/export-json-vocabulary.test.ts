import type { LexicalEditor } from 'lexical'

import { $createBaseFileNode, BaseFileNode } from '@kobato/inkling-internal/nodes/base/nodes/file/FileNode'
import { $createBaseImageNode, BaseImageNode } from '@kobato/inkling-internal/nodes/base/nodes/image/ImageNode'
import { $createBaseVideoNode, BaseVideoNode } from '@kobato/inkling-internal/nodes/base/nodes/video/VideoNode'
import { editorTest } from '@kobato/inkling/tests/utils/test-editor'
import { createHeadlessEditor } from '@lexical/headless'
import { describe, expect, it } from 'vitest'

const editor: LexicalEditor = createHeadlessEditor({ nodes: [BaseImageNode, BaseVideoNode, BaseFileNode] })

function declaredPropertyNames(nodeClass: { getPropertyDefaults(): Record<string, unknown> }): string[] {
  return Object.keys(nodeClass.getPropertyDefaults())
}

describe('card exportJSON vocabulary', function () {
  it(
    'video exportJSON keys are exactly the declared properties, in declared order',
    editorTest(
      () => editor,
      () => {
        const json = $createBaseVideoNode().exportJSON()
        expect(Object.keys(json)).toEqual(['type', 'version', ...declaredPropertyNames(BaseVideoNode)])
      },
    ),
  )

  it(
    'file exportJSON keys are exactly the declared properties, in declared order',
    editorTest(
      () => editor,
      () => {
        const json = $createBaseFileNode().exportJSON()
        expect(Object.keys(json)).toEqual(['type', 'version', ...declaredPropertyNames(BaseFileNode)])
      },
    ),
  )

  it(
    'image exportJSON keys are exactly the declared properties, in the historical persisted order',
    editorTest(
      () => editor,
      () => {
        const json = $createBaseImageNode().exportJSON()
        expect(Object.keys(json)).toEqual([
          'type',
          'version',
          'src',
          'width',
          'height',
          'title',
          'alt',
          'caption',
          'cardWidth',
          'href',
        ])
        expect(Object.keys(json).sort()).toEqual(['type', 'version', ...declaredPropertyNames(BaseImageNode)].sort())
      },
    ),
  )

  it.each([
    { card: 'image', create: $createBaseImageNode },
    { card: 'video', create: $createBaseVideoNode },
    { card: 'file', create: $createBaseFileNode },
  ])('$card exportJSON persists the placeholder for a data-string src', ({ create }) =>
    editorTest(
      () => editor,
      () => {
        const json = create({ src: 'data:image/png;base64,iVBORw0KGgo=' }).exportJSON()
        expect(json.src).toBe('<base64String>')
      },
    )(),
  )
})
