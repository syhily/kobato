import type { LexicalEditor } from 'lexical'

import { createHeadlessEditor } from '@lexical/headless'
import { describe, expect, it } from 'vitest'

import { editorTest } from '#/utils/test-editor'
import { $createBaseFileNode, BaseFileNode } from '@/nodes/base/nodes/file/FileNode'
import { $createBaseImageNode, BaseImageNode } from '@/nodes/base/nodes/image/ImageNode'
import { $createBaseVideoNode, BaseVideoNode } from '@/nodes/base/nodes/video/VideoNode'

/**
 * Drift guard for the cards whose `exportJSON` is (or was) a hand-written key
 * list: the serialized vocabulary must stay tied to the card's declared
 * `properties`. Video/File derive `exportJSON` from the generated path, so
 * this pins the agreement for them; Image keeps a hand-written override
 * because its persisted key order is historical, so this is the check that
 * fails when a property is added without updating the override. Bookmark is
 * excluded — its serialized shape (nested `metadata`) is deliberately not a
 * flat property list.
 */

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
        // the persisted key order differs from `imageProperties` order and
        // must not change — payloads stay byte-identical
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
