import type { LexicalEditor } from 'lexical'

import { createHeadlessEditor } from '@lexical/headless'
import { beforeEach, describe, expect, it } from 'vitest'

import { editorTest } from '#/inkling/utils/test-editor'
import { ZWNJNode, $createZWNJNode, $isZWNJNode } from '@/inkling/nodes/base/index'

const editorNodes = [ZWNJNode]

describe('ZWNJNode', function () {
  let editor: LexicalEditor

  beforeEach(function () {
    editor = createHeadlessEditor({ nodes: editorNodes })
  })

  it(
    'matches node with $isZWNJNode',
    editorTest(
      () => editor,
      function () {
        const zwnjNode = $createZWNJNode()
        expect($isZWNJNode(zwnjNode)).toBe(true)
      },
    ),
  )
})
