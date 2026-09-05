import type { LexicalEditor } from 'lexical'

import { createHeadlessEditor } from '@lexical/headless'

import { editorTest } from '#/utils/test-editor'
import { ZWNJNode, $createZWNJNode, $isZWNJNode } from '@/nodes/base/index'

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
