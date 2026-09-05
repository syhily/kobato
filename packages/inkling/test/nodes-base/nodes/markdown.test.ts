import type { LexicalEditor } from 'lexical'

import { createHeadlessEditor } from '@lexical/headless'
import { $getRoot } from 'lexical'

import { expectPrettifiedHtml } from '#/nodes-base/test-utils/assertions'
import { dom, html } from '#/nodes-base/test-utils/index'
import { editorTest } from '#/utils/test-editor'
import { MarkdownNode, $createMarkdownNode, $isMarkdownNode } from '@/nodes/base/index'

const editorNodes = [MarkdownNode]

describe('MarkdownNode', function () {
  let editor: LexicalEditor
  let dataset: { markdown: string }
  let exportOptions: Record<string, unknown>

  beforeEach(function () {
    editor = createHeadlessEditor({ nodes: editorNodes })

    dataset = {
      markdown: '#HEADING\r\n- list\r\n- items',
    }

    exportOptions = {
      dom,
    }
  })

  it(
    'matches node with $isMarkdownNode',
    editorTest(
      () => editor,
      async function () {
        const markdownNode = $createMarkdownNode(dataset)
        expect($isMarkdownNode(markdownNode)).toBe(true)
      },
    ),
  )

  describe('data access', function () {
    it(
      'has getters for all properties',
      editorTest(
        () => editor,
        async function () {
          const markdownNode = $createMarkdownNode(dataset)

          expect(markdownNode.markdown).toBe('#HEADING\r\n- list\r\n- items')
        },
      ),
    )

    it(
      'has setters for all properties',
      editorTest(
        () => editor,
        async function () {
          const markdownNode = $createMarkdownNode(dataset)

          expect(markdownNode.markdown).toBe('#HEADING\r\n- list\r\n- items')
          markdownNode.markdown = '#HEADING 2\r\n- list\r\n- items'
          expect(markdownNode.markdown).toBe('#HEADING 2\r\n- list\r\n- items')
        },
      ),
    )

    it(
      'has getDataset() convenience method',
      editorTest(
        () => editor,
        async function () {
          const markdownNode = $createMarkdownNode(dataset)
          const markdownNodeDataset = markdownNode.getDataset()

          expect(markdownNodeDataset).toEqual({
            ...dataset,
          })
        },
      ),
    )
  })

  describe('isEmpty()', function () {
    it(
      'returns true if markdown is empty',
      editorTest(
        () => editor,
        async function () {
          const markdownNode = $createMarkdownNode(dataset)

          expect(markdownNode.isEmpty()).toBe(false)
          markdownNode.markdown = ''
          expect(markdownNode.isEmpty()).toBe(true)
        },
      ),
    )
  })

  describe('getType', function () {
    it(
      'returns the correct node type',
      editorTest(
        () => editor,
        async function () {
          expect(MarkdownNode.getType()).toBe('markdown')
        },
      ),
    )
  })

  describe('clone', function () {
    it(
      'returns a copy of the current node',
      editorTest(
        () => editor,
        async function () {
          const markdownNode = $createMarkdownNode(dataset)
          const markdownNodeDataset = markdownNode.getDataset()
          const clone = MarkdownNode.clone(markdownNode) as MarkdownNode
          const cloneDataset = clone.getDataset()

          expect(cloneDataset).toEqual({ ...markdownNodeDataset })
        },
      ),
    )
  })

  describe('urlTransformMap', function () {
    it(
      'contains the expected URL mapping',
      editorTest(
        () => editor,
        async function () {
          expect(MarkdownNode.urlTransformMap).toEqual({
            markdown: 'markdown',
          })
        },
      ),
    )
  })

  describe('hasEditMode', function () {
    it(
      'returns true',
      editorTest(
        () => editor,
        async function () {
          const markdownNode = $createMarkdownNode(dataset)
          expect(markdownNode.hasEditMode()).toBe(true)
        },
      ),
    )
  })

  describe('exportDOM', function () {
    it(
      'creates a markdown card',
      editorTest(
        () => editor,
        async function () {
          const markdownNode = $createMarkdownNode(dataset)
          const result = markdownNode.exportDOM(editor, exportOptions)
          const element = result.element as HTMLElement

          expect(result.type).toBe('inner')
          await expectPrettifiedHtml(
            element.innerHTML,
            html`
              <h1 id="heading">HEADING</h1>
              <ul>
                <li>list</li>
                <li>items</li>
              </ul>
            `,
          )
        },
      ),
    )

    it(
      'renders an empty div with a missing src',
      editorTest(
        () => editor,
        async function () {
          const markdownNode = $createMarkdownNode()
          const result = markdownNode.exportDOM(editor, exportOptions)
          const element = result.element as HTMLElement

          expect(element.outerHTML).toBe('<div></div>')
        },
      ),
    )

    it(
      'throws a clear error when createDocument is not callable',
      editorTest(
        () => editor,
        async function () {
          const markdownNode = $createMarkdownNode(dataset)

          expect(() => markdownNode.exportDOM(editor, { createDocument: true as unknown as () => Document })).toThrow(
            /^renderMarkdownNode requires options\.createDocument to be a function$/,
          )
        },
      ),
    )

    it(
      'sanitizes raw HTML in the markdown source',
      editorTest(
        () => editor,
        function () {
          const markdownNode = $createMarkdownNode({ markdown: '<script>alert(1)</script>' })
          const result = markdownNode.exportDOM(editor, exportOptions)
          const element = result.element as HTMLElement

          expect(element.innerHTML).not.toContain('<script>alert(1)</script>')
          expect(element.innerHTML).not.toContain('<script>')
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
          const markdownNode = $createMarkdownNode(dataset)
          const json = markdownNode.exportJSON()

          expect(json).toEqual({
            type: 'markdown',
            version: 1,
            markdown: '#HEADING\r\n- list\r\n- items',
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
                type: 'markdown',
                ...dataset,
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
            const [markdownNode] = $getRoot().getChildren() as MarkdownNode[]

            expect(markdownNode.markdown).toBe('#HEADING\r\n- list\r\n- items')

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
        async function () {
          const node = $createMarkdownNode()
          expect(node.getTextContent()).toBe('')

          node.markdown = '#HEADING\r\n- list\r\n- items'

          expect(node.getTextContent()).toBe('#HEADING\r\n- list\r\n- items\n\n')
        },
      ),
    )
  })
})
