import type { LexicalEditor } from 'lexical'

import { createHeadlessEditor } from '@lexical/headless'
import { $generateNodesFromDOM } from '@lexical/html'
import { $getRoot, $createParagraphNode, $createTextNode } from 'lexical'

import { createDocument, html } from '#/nodes-base/test-utils/index'
import { editorTest } from '#/utils/test-editor'
import { AsideNode, $createAsideNode, $isAsideNode } from '@/nodes/base/index'

const editorNodes = [AsideNode]

describe('AsideNode', function () {
  let editor: LexicalEditor

  beforeEach(function () {
    editor = createHeadlessEditor({ nodes: editorNodes })
  })

  it(
    'matches node with $isAsideNode',
    editorTest(
      () => editor,
      function () {
        const asideNode = $createAsideNode()
        expect($isAsideNode(asideNode)).toBe(true)
      },
    ),
  )

  describe('importDOM', function () {
    it(
      'parses an aside element',
      editorTest(
        () => editor,
        function () {
          const document = createDocument(html` <blockquote class="inkling-blockquote-alt">Hello</blockquote> `)
          const nodes = $generateNodesFromDOM(editor, document)

          expect(nodes.length).toBe(1)
          expect(nodes[0]).toBeInstanceOf(AsideNode)
        },
      ),
    )
  })

  describe('exportJSON', function () {
    it(
      'contains all data',
      editorTest(
        () => editor,
        function () {
          const asideNode = $createAsideNode()
          const json = asideNode.exportJSON()

          expect(json).toEqual({
            type: 'aside',
            version: 1,
            children: [],
            direction: null,
            format: '',
            indent: 0,
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
                type: 'aside',
              },
            ],
            direction: null,
            format: '',
            indent: 0,
            type: 'root',
            version: 1,
          },
        })

        const editorState = editor.parseEditorState(serializedState)
        editor.setEditorState(editorState)

        editor.getEditorState().read(() => {
          try {
            const [asideNode] = $getRoot().getChildren()
            expect(asideNode).toBeInstanceOf(AsideNode)

            resolve()
          } catch (e) {
            reject(e)
          }
        })
      }))
  })

  describe('getTextContent', function () {
    it(
      'returns contents',
      editorTest(
        () => editor,
        function () {
          const node = $createAsideNode()
          expect(node.getTextContent()).toBe('')

          const paragraph = $createParagraphNode()
          paragraph.append($createTextNode('Hello'))

          node.append(paragraph)

          expect(node.getTextContent()).toBe('Hello')
        },
      ),
    )
  })
})
