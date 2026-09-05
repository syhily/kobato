import type { LexicalEditor } from 'lexical'

import { createHeadlessEditor } from '@lexical/headless'
import { $generateNodesFromDOM } from '@lexical/html'
import { $getRoot } from 'lexical'

import { expectPrettifiedHtml } from '#/nodes-base/test-utils/assertions'
import { createDocument, dom, html } from '#/nodes-base/test-utils/index'
import { editorTest } from '#/utils/test-editor'
import { BaseHorizontalRuleNode, $createBaseHorizontalRuleNode, $isHorizontalRuleNode } from '@/nodes/base/index'

const editorNodes = [BaseHorizontalRuleNode]

describe('HorizontalNode', function () {
  let editor: LexicalEditor
  let exportOptions: { dom: typeof dom }

  beforeEach(function () {
    editor = createHeadlessEditor({ nodes: editorNodes })

    exportOptions = {
      dom,
    }
  })

  it(
    'matches node with $isHorizontalRuleNode',
    editorTest(
      () => editor,
      async function () {
        const hrNode = $createBaseHorizontalRuleNode()
        expect($isHorizontalRuleNode(hrNode)).toBe(true)
      },
    ),
  )

  describe('exportDOM', function () {
    it(
      'creates hr element',
      editorTest(
        () => editor,
        async function () {
          const hrNode = $createBaseHorizontalRuleNode()
          const { element } = hrNode.exportDOM(editor, exportOptions)

          await expectPrettifiedHtml((element as HTMLElement).outerHTML, html` <hr /> `)
        },
      ),
    )
  })

  describe('importDOM', function () {
    it(
      'parses an hr element',
      editorTest(
        () => editor,
        async function () {
          const document = createDocument(html` <hr /> `)
          const nodes = $generateNodesFromDOM(editor, document)

          expect(nodes.length).toBe(1)
          expect(nodes[0]).toBeInstanceOf(BaseHorizontalRuleNode)
        },
      ),
    )
  })

  describe('exportJSON', function () {
    it(
      'contains all data',
      editorTest(
        () => editor,
        async function () {
          const hrNode = $createBaseHorizontalRuleNode()
          const json = hrNode.exportJSON()

          expect(json).toEqual({
            type: 'horizontalrule',
            version: 1,
          })
        },
      ),
    )
  })

  describe('importJSON', function () {
    it('imports all data', () =>
      new Promise<void>((resolve, reject) => {
        const serializedState = JSON.stringify({
          root: {
            children: [
              {
                type: 'horizontalrule',
              },
            ],
            type: 'root',
            version: 1,
          },
        })

        const editorState = editor.parseEditorState(serializedState)
        editor.setEditorState(editorState)

        editor.getEditorState().read(() => {
          try {
            const [hrNode] = $getRoot().getChildren()
            expect(hrNode).toBeInstanceOf(BaseHorizontalRuleNode)

            resolve()
          } catch (e) {
            reject(e)
          }
        })
      }))
  })

  describe('getTextContent', function () {
    it(
      'returns plaintext representation',
      editorTest(
        () => editor,
        async function () {
          const node = $createBaseHorizontalRuleNode()
          expect(node.getTextContent()).toBe('---\n\n')
        },
      ),
    )
  })
})
