import type { LexicalEditor } from 'lexical'

import { ZWNJNode, $createZWNJNode, $isZWNJNode } from '@kobato/inkling-internal/nodes/base/index'
import { editorTest } from '@kobato/inkling/tests/utils/test-editor'
import { createHeadlessEditor } from '@lexical/headless'
import { beforeEach, describe, expect, it } from 'vitest'

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
