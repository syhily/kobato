import type { ElementNode, HTMLConfig, LexicalEditor } from 'lexical'

import { createHeadlessEditor } from '@lexical/headless'
import { $generateNodesFromDOM } from '@lexical/html'

import { createDocument } from '#/nodes-base/test-utils/index'
import { editorTest } from '#/utils/test-editor'
import { DEFAULT_CONFIG, DEFAULT_NODES } from '@/nodes/base/index'

describe('Serializers: paragraph', function () {
  let editor: LexicalEditor

  beforeEach(function () {
    editor = createHeadlessEditor({ nodes: DEFAULT_NODES, html: DEFAULT_CONFIG.html as HTMLConfig })
  })

  describe('import', function () {
    it(
      '(non GDoc) keeps empty paragraphs',
      editorTest(
        () => editor,
        function () {
          const htmlString = '<p>Hello World</p><p></p><p>After</p>'
          const document = createDocument(htmlString)
          const nodes = $generateNodesFromDOM(editor, document)

          expect(nodes.length).toBe(3)
          expect(nodes[0].getType()).toBe('paragraph')
          expect(nodes[1].getType()).toBe('paragraph')
          expect(nodes[2].getType()).toBe('paragraph')
        },
      ),
    )

    it(
      '(GDoc) removes empty paragraphs',
      editorTest(
        () => editor,
        function () {
          const htmlString = '<div id="docs-internal-guid-1234"><p>Hello World</p><p></p><p>After</p></div>'
          const document = createDocument(htmlString)
          const nodes = $generateNodesFromDOM(editor, document)

          expect(nodes.length).toBe(2)
          expect(nodes[0].getType()).toBe('paragraph')
          expect(nodes[1].getType()).toBe('paragraph')
        },
      ),
    )

    it(
      '(non GDoc) keeps empty paragraphs around dividers',
      editorTest(
        () => editor,
        function () {
          const htmlString = '<p>Hello World</p><p><hr></p><p>After</p>'
          const document = createDocument(htmlString)
          const nodes = $generateNodesFromDOM(editor, document)

          expect(nodes.length).toBe(5)
          expect(nodes[0].getType()).toBe('paragraph')
          expect(nodes[1].getType()).toBe('paragraph')
          expect(nodes[2].getType()).toBe('horizontalrule')
          expect(nodes[3].getType()).toBe('paragraph')
          expect(nodes[4].getType()).toBe('paragraph')
        },
      ),
    )

    it(
      '(GDoc) removes empty paragraphs around dividers',
      editorTest(
        () => editor,
        function () {
          const htmlString = '<div id="docs-internal-guid-1234"><p>Hello World</p><p><hr></p><p>After</p></div>'
          const document = createDocument(htmlString)
          const nodes = $generateNodesFromDOM(editor, document)

          expect(nodes.length).toBe(3)
          expect(nodes[0].getType()).toBe('paragraph')
          expect(nodes[1].getType()).toBe('paragraph')
          expect((nodes[1] as ElementNode).getChildren().length).toBe(1)
          expect((nodes[1] as ElementNode).getChildren()[0].getType()).toBe('horizontalrule')
          expect(nodes[2].getType()).toBe('paragraph')
        },
      ),
    )
  })
})
