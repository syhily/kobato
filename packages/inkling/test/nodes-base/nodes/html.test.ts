import { createHeadlessEditor } from '@lexical/headless'
import { $generateNodesFromDOM } from '@lexical/html'
import { $getRoot, type LexicalEditor } from 'lexical'

import { expectPrettifiedHtml } from '#/nodes-base/test-utils/assertions'
import { createDocument, dom, html } from '#/nodes-base/test-utils/index'
import { editorTest } from '#/utils/test-editor'
import { BaseHtmlNode, $createBaseHtmlNode, $isHtmlNode, type ExportDOMOptions } from '@/nodes/base/index'

const editorNodes = [BaseHtmlNode]

describe('BaseHtmlNode', function () {
  let editor: LexicalEditor
  let dataset: Record<string, unknown>
  let exportOptions: ExportDOMOptions

  beforeEach(function () {
    editor = createHeadlessEditor({
      nodes: editorNodes,
      onError: (e: Error) => {
        throw e
      },
    })

    dataset = {
      html: '<p>Paragraph with:</p><ul><li>list</li><li>items</li></ul>',
    }

    exportOptions = {
      dom,
    }
  })

  it(
    'matches node with $isHtmlNode',
    editorTest(
      () => editor,
      async function () {
        const htmlNode = $createBaseHtmlNode(dataset)
        expect($isHtmlNode(htmlNode)).toBe(true)
      },
    ),
  )

  describe('data access', function () {
    it(
      'has getters for all properties',
      editorTest(
        () => editor,
        async function () {
          const htmlNode = $createBaseHtmlNode(dataset)

          expect(htmlNode.html).toBe('<p>Paragraph with:</p><ul><li>list</li><li>items</li></ul>')
        },
      ),
    )

    it(
      'has setters for all properties',
      editorTest(
        () => editor,
        async function () {
          const htmlNode = $createBaseHtmlNode(dataset)

          expect(htmlNode.html).toBe('<p>Paragraph with:</p><ul><li>list</li><li>items</li></ul>')
          htmlNode.html = '<p>Paragraph 1</p><p>Paragraph 2</p>'
          expect(htmlNode.html).toBe('<p>Paragraph 1</p><p>Paragraph 2</p>')
        },
      ),
    )

    it(
      'has getDataset() convenience method',
      editorTest(
        () => editor,
        async function () {
          const htmlNode = $createBaseHtmlNode(dataset)
          const htmlNodeDataset = htmlNode.getDataset()

          expect(htmlNodeDataset).toEqual({ ...dataset })
        },
      ),
    )

    it(
      'has isEmpty() convenience method',
      editorTest(
        () => editor,
        async function () {
          const htmlNode = $createBaseHtmlNode(dataset)

          expect(htmlNode.isEmpty()).toBe(false)
          htmlNode.html = ''
          expect(htmlNode.isEmpty()).toBe(true)
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
          const htmlNode = $createBaseHtmlNode(dataset)

          expect(htmlNode.isEmpty()).toBe(false)
          htmlNode.html = ''
          expect(htmlNode.isEmpty()).toBe(true)
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
          expect(BaseHtmlNode.getType()).toBe('html')
        },
      ),
    )
  })

  describe('getPropertyDefaults', function () {
    it(
      'returns the correct default values',
      editorTest(
        () => editor,
        async function () {
          const defaults = BaseHtmlNode.getPropertyDefaults()

          expect(defaults).toEqual({
            html: '',
          })
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
          const htmlNode = $createBaseHtmlNode(dataset)
          const htmlNodeDataset = htmlNode.getDataset()
          const clone = BaseHtmlNode.clone(htmlNode)
          const cloneDataset = clone.getDataset()

          expect(cloneDataset).toEqual({ ...htmlNodeDataset })
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
          expect(BaseHtmlNode.urlTransformMap).toEqual({
            html: 'html',
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
          const htmlNode = $createBaseHtmlNode(dataset)
          expect(htmlNode.hasEditMode()).toBe(true)
        },
      ),
    )
  })

  describe('exportDOM', function () {
    it(
      'creates a html card',
      editorTest(
        () => editor,
        async function () {
          const htmlNode = $createBaseHtmlNode(dataset)
          const result = htmlNode.exportDOM(editor, exportOptions)
          expect(result.type).toBe('value')
          const element = result.element as HTMLTextAreaElement
          await expectPrettifiedHtml(
            element.value,
            html`
              <!--inkling-card-begin: html-->
              <p>Paragraph with:</p>
              <ul>
                <li>list</li>
                <li>items</li>
              </ul>
              <!--inkling-card-end: html-->
            `,
          )
        },
      ),
    )

    it(
      'renders an empty span with missing html',
      editorTest(
        () => editor,
        async function () {
          const htmlNode = $createBaseHtmlNode()
          const result = htmlNode.exportDOM(editor, exportOptions)
          expect(result.type).toBe('inner')
          const element = result.element as HTMLElement

          expect(element.outerHTML).toBe('<span></span>')
        },
      ),
    )

    it(
      'renders unclosed tags',
      editorTest(
        () => editor,
        async function () {
          const htmlNode = $createBaseHtmlNode({ html: '<div style="color:red">' })
          const result = htmlNode.exportDOM(editor, exportOptions)
          expect(result.type).toBe('value')
          const element = result.element as HTMLTextAreaElement

          // do not prettify, it will add a closing tag to the compared string causing a false pass
          expect(element.value).toBe(
            '\n<!--inkling-card-begin: html-->\n<div style="color:red">\n<!--inkling-card-end: html-->\n',
          )
        },
      ),
    )

    it(
      'renders html entities',
      editorTest(
        () => editor,
        async function () {
          const htmlNode = $createBaseHtmlNode({ html: '<p>&lt;pre&gt;Test&lt;/pre&gt;</p>' })
          const result = htmlNode.exportDOM(editor, exportOptions)
          expect(result.type).toBe('value')
          const element = result.element as HTMLTextAreaElement

          expect(element.value).toBe(
            '\n<!--inkling-card-begin: html-->\n<p>&lt;pre&gt;Test&lt;/pre&gt;</p>\n<!--inkling-card-end: html-->\n',
          )
        },
      ),
    )

    it(
      'handles single-quote attributes',
      editorTest(
        () => editor,
        async function () {
          const htmlNode = $createBaseHtmlNode({
            html: '<div data-graph-name=\'The "all-in" cost of a grant\'>Test</div>',
          })
          const result = htmlNode.exportDOM(editor, exportOptions)
          expect(result.type).toBe('value')
          const element = result.element as HTMLTextAreaElement

          expect(element.value).toBe(
            '\n<!--inkling-card-begin: html-->\n<div data-graph-name=\'The "all-in" cost of a grant\'>Test</div>\n<!--inkling-card-end: html-->\n',
          )
        },
      ),
    )
  })

  describe('importDOM', function () {
    it(
      'parses a html node',
      editorTest(
        () => editor,
        async function () {
          const document = createDocument(html`
            <span
              ><!--inkling-card-begin: html-->
              <p>here's html</p>
              <!--inkling-card-end: html--></span
            >
          `)
          const nodes = $generateNodesFromDOM(editor, document)
          expect(nodes.length).toBe(1)
          expect(nodes[0]).toBeInstanceOf(BaseHtmlNode)
        },
      ),
    )

    it(
      'removes the html end comment from the DOM after parsing',
      editorTest(
        () => editor,
        async function () {
          const document = createDocument(html`
            <span
              ><!--inkling-card-begin: html-->
              <p>here's html</p>
              <!--inkling-card-end: html--></span
            >
          `)

          $generateNodesFromDOM(editor, document)

          const hasEndComment = Array.from(document.querySelector('span')?.childNodes || []).some((node) => {
            return node.nodeType === 8 && node.nodeValue?.trim() === 'inkling-card-end: html'
          })

          expect(hasEndComment).toBe(false)
        },
      ),
    )

    it(
      'does not consume sibling nodes when the html end comment is missing',
      editorTest(
        () => editor,
        async function () {
          const document = createDocument(html`
            <span
              ><!--inkling-card-begin: html-->
              <p>here's html</p>
              <div>keep me</div></span
            >
          `)

          const nodes = $generateNodesFromDOM(editor, document) as BaseHtmlNode[]
          const htmlNodes = nodes.filter((node) => node instanceof BaseHtmlNode)

          expect(htmlNodes.length).toBe(1)
          expect(htmlNodes[0].html).toBe('')
          expect(document.querySelector('p')?.outerHTML).toBe("<p>here's html</p>")
          expect(document.querySelector('div')?.outerHTML).toBe('<div>keep me</div>')
        },
      ),
    )

    it(
      'parses html table',
      editorTest(
        () => editor,
        async function () {
          const document = createDocument(html`
            <table style="float:right">
              <tr>
                <th>Month</th>
                <th>Savings</th>
              </tr>
              <tr>
                <td>January</td>
                <td>$100</td>
              </tr>
              <tr>
                <td>February</td>
                <td>$80</td>
              </tr>
            </table>
          `)
          const nodes = $generateNodesFromDOM(editor, document)
          expect(nodes.length).toBe(1)
          expect(nodes[0]).toBeInstanceOf(BaseHtmlNode)
        },
      ),
    )

    it(
      'parses table nested in another table',
      editorTest(
        () => editor,
        async function () {
          const document = createDocument(html`
            <table id="table1">
              <tr>
                <th>title1</th>
                <th>title2</th>
                <th>title3</th>
              </tr>
              <tr>
                <td id="nested">
                  <table id="table2">
                    <tr>
                      <td>cell1</td>
                      <td>cell2</td>
                      <td>cell3</td>
                    </tr>
                  </table>
                </td>
                <td>cell2</td>
                <td>cell3</td>
              </tr>
              <tr>
                <td>cell4</td>
                <td>cell5</td>
                <td>cell6</td>
              </tr>
            </table>
          `)
          const nodes = $generateNodesFromDOM(editor, document)
          expect(nodes.length).toBe(1)
          expect(nodes[0]).toBeInstanceOf(BaseHtmlNode)
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
          const htmlNode = $createBaseHtmlNode(dataset)
          const json = htmlNode.exportJSON()

          expect(json).toEqual({
            type: 'html',
            version: 1,
            html: '<p>Paragraph with:</p><ul><li>list</li><li>items</li></ul>',
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
                type: 'html',
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
            const [htmlNode] = $getRoot().getChildren() as BaseHtmlNode[]

            expect(htmlNode.html).toBe('<p>Paragraph with:</p><ul><li>list</li><li>items</li></ul>')

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
          const node = $createBaseHtmlNode()
          expect(node.getTextContent()).toBe('')

          node.html = '<script>const test = true;</script>'

          expect(node.getTextContent()).toBe('<script>const test = true;</script>\n\n')
        },
      ),
    )
  })
})
