import type { LexicalEditor } from 'lexical'

import { createHeadlessEditor } from '@lexical/headless'
import { $generateNodesFromDOM } from '@lexical/html'
import { $getRoot } from 'lexical'

import { expectPrettifiedHtml } from '#/nodes-base/test-utils/assertions'
import { createDocument, dom, html } from '#/nodes-base/test-utils/index'
import { editorTest } from '#/utils/test-editor'
import { BaseCalloutNode, $createBaseCalloutNode, $isCalloutNode } from '@/nodes/base/index'

const editorNodes = [BaseCalloutNode]

describe('BaseCalloutNode', function () {
  let editor: LexicalEditor
  let dataset: { calloutText: string; calloutEmoji: string; backgroundColor: string }
  let exportOptions: Record<string, unknown>

  beforeEach(function () {
    editor = createHeadlessEditor({
      nodes: editorNodes,
    })
    dataset = {
      calloutText:
        '<p dir="ltr"><b><strong>Hello!</strong></b><span> Check </span><i><em class="italic">this</em></i> <a href="https://inkling.local" rel="noopener"><span>out</span></a><span>.</span></p>',
      calloutEmoji: '\u{1F4A1}',
      backgroundColor: 'blue',
    }

    exportOptions = {
      exportFormat: 'html',
      dom,
    }
  })

  it(
    'can match node with calloutNode',
    editorTest(
      () => editor,
      async function () {
        const node = $createBaseCalloutNode(dataset)
        expect($isCalloutNode(node)).toBe(true)
      },
    ),
  )

  describe('data access', function () {
    it(
      'has getters for all properties',
      editorTest(
        () => editor,
        async function () {
          const node = $createBaseCalloutNode(dataset)
          expect(node.calloutText).toBe(dataset.calloutText)
          expect(node.calloutEmoji).toBe(dataset.calloutEmoji)
          expect(node.backgroundColor).toBe(dataset.backgroundColor)
        },
      ),
    )

    it(
      'has setters for all properties',
      editorTest(
        () => editor,
        async function () {
          const node = $createBaseCalloutNode(dataset)
          node.calloutText = 'new text'
          expect(node.calloutText).toBe('new text')
          node.backgroundColor = 'red'
          expect(node.backgroundColor).toBe('red')
          node.calloutEmoji = '\u{1F44D}'
          expect(node.calloutEmoji).toBe('\u{1F44D}')
        },
      ),
    )

    it(
      'keeps an explicit empty backgroundColor instead of coalescing to the default',
      editorTest(
        () => editor,
        async function () {
          const node = $createBaseCalloutNode({ backgroundColor: '' })
          expect(node.backgroundColor).toBe('')
        },
      ),
    )

    it(
      'has getDataset() method',
      editorTest(
        () => editor,
        async function () {
          const node = $createBaseCalloutNode(dataset)
          const nodeDataset = node.getDataset()
          expect(nodeDataset).toEqual(dataset)
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
          expect(BaseCalloutNode.getType()).toBe('callout')
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
          const calloutNode = $createBaseCalloutNode(dataset)
          const calloutNodeDataset = calloutNode.getDataset()
          const clone = BaseCalloutNode.clone(calloutNode)
          const cloneDataset = clone.getDataset()

          expect(cloneDataset).toEqual({ ...calloutNodeDataset })
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
          expect(BaseCalloutNode.urlTransformMap).toEqual({})
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
          const calloutNode = $createBaseCalloutNode(dataset)
          expect(calloutNode.hasEditMode()).toBe(true)
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
          const calloutNode = $createBaseCalloutNode(dataset)
          const json = calloutNode.exportJSON()

          expect(json).toEqual({
            type: 'callout',
            version: 1,
            ...dataset,
          })
        },
      ),
    )
  })

  describe('exportDOM', function () {
    it(
      'can render to HTML',
      editorTest(
        () => editor,
        async function () {
          const node = $createBaseCalloutNode(dataset)
          const result = node.exportDOM(editor, exportOptions)
          const element = result.element as HTMLElement
          await expectPrettifiedHtml(
            element.outerHTML,
            html`
              <div class="inkling-card inkling-callout-card inkling-callout-card-blue">
                <div class="inkling-callout-emoji">💡</div>
                <div class="inkling-callout-text">
                  <b><strong>Hello!</strong></b
                  >Check<i><em>this</em></i
                  ><a href="https://inkling.local" rel="noopener">out</a>.
                </div>
              </div>
            `,
          )
        },
      ),
    )

    it(
      'can render to HTML with no emoji',
      editorTest(
        () => editor,
        async function () {
          const dataset2 = {
            calloutText:
              '<p dir="ltr"><b><strong>Hello!</strong></b><span> Check </span><i><em class="italic">this</em></i> <a href="https://inkling.local" rel="noopener"><span>out</span></a><span>.</span></p>',
            calloutEmoji: '',
            backgroundColor: 'blue',
          }
          const node = $createBaseCalloutNode(dataset2)
          const result = node.exportDOM(editor, exportOptions)
          const element = result.element as HTMLElement
          await expectPrettifiedHtml(
            element.outerHTML,
            html`
              <div class="inkling-card inkling-callout-card inkling-callout-card-blue">
                <div class="inkling-callout-text">
                  <b><strong>Hello!</strong></b
                  >Check<i><em>this</em></i
                  ><a href="https://inkling.local" rel="noopener">out</a>.
                </div>
              </div>
            `,
          )
        },
      ),
    )

    it(
      'can render to HTML with invalid backgroundColor',
      editorTest(
        () => editor,
        async function () {
          dataset.backgroundColor = 'rgba(124, 139, 154, 0.13)'

          const node = $createBaseCalloutNode(dataset)
          const result = node.exportDOM(editor, exportOptions)
          const element = result.element as HTMLElement

          await expectPrettifiedHtml(
            element.outerHTML,
            html`
              <div class="inkling-card inkling-callout-card inkling-callout-card-white">
                <div class="inkling-callout-emoji">💡</div>
                <div class="inkling-callout-text">
                  <b><strong>Hello!</strong></b
                  >Check<i><em>this</em></i
                  ><a href="https://inkling.local" rel="noopener">out</a>.
                </div>
              </div>
            `,
          )
        },
      ),
    )

    it(
      'can render with inline code',
      editorTest(
        () => editor,
        async function () {
          dataset.calloutText =
            '<p><span style="white-space: pre-wrap;">Does </span><code spellcheck="false" style="white-space: pre-wrap;"><span>inline code</span></code><span style="white-space: pre-wrap;"> render properly?</span></p>'

          const node = $createBaseCalloutNode(dataset)
          const result = node.exportDOM(editor, exportOptions)
          const element = result.element as HTMLElement

          await expectPrettifiedHtml(
            element.outerHTML,
            html`
              <div class="inkling-card inkling-callout-card inkling-callout-card-blue">
                <div class="inkling-callout-emoji">💡</div>
                <div class="inkling-callout-text">
                  Does <code spellcheck="false" style="white-space: pre-wrap">inline code</code> render properly?
                </div>
              </div>
            `,
          )
        },
      ),
    )

    it(
      'strips dangerous href and event handlers from links',
      editorTest(
        () => editor,
        async function () {
          dataset.calloutText = '<a href="javascript:alert(1)" onmouseover="alert(2)">x</a>'

          const node = $createBaseCalloutNode(dataset)
          const result = node.exportDOM(editor, exportOptions)
          const element = result.element as HTMLElement

          await expectPrettifiedHtml(
            element.outerHTML,
            html`
              <div class="inkling-card inkling-callout-card inkling-callout-card-blue">
                <div class="inkling-callout-emoji">💡</div>
                <div class="inkling-callout-text"><a>x</a></div>
              </div>
            `,
          )
        },
      ),
    )

    it(
      'preserves safe link hrefs',
      editorTest(
        () => editor,
        async function () {
          dataset.calloutText = '<a href="https://example.com">ok</a>'

          const node = $createBaseCalloutNode(dataset)
          const result = node.exportDOM(editor, exportOptions)
          const element = result.element as HTMLElement

          await expectPrettifiedHtml(
            element.outerHTML,
            html`
              <div class="inkling-card inkling-callout-card inkling-callout-card-blue">
                <div class="inkling-callout-emoji">💡</div>
                <div class="inkling-callout-text"><a href="https://example.com">ok</a></div>
              </div>
            `,
          )
        },
      ),
    )

    it(
      'strips style and event handlers from marks',
      editorTest(
        () => editor,
        async function () {
          dataset.calloutText = '<mark style="background:red" onclick="x">m</mark>'

          const node = $createBaseCalloutNode(dataset)
          const result = node.exportDOM(editor, exportOptions)
          const element = result.element as HTMLElement

          await expectPrettifiedHtml(
            element.outerHTML,
            html`
              <div class="inkling-card inkling-callout-card inkling-callout-card-blue">
                <div class="inkling-callout-emoji">💡</div>
                <div class="inkling-callout-text"><mark>m</mark></div>
              </div>
            `,
          )
        },
      ),
    )

    it(
      'strips inline-code styles outside the editor serialization',
      editorTest(
        () => editor,
        async function () {
          dataset.calloutText = '<code style="position:fixed;inset:0">x</code>'

          const node = $createBaseCalloutNode(dataset)
          const result = node.exportDOM(editor, exportOptions)
          const element = result.element as HTMLElement

          await expectPrettifiedHtml(
            element.outerHTML,
            html`
              <div class="inkling-card inkling-callout-card inkling-callout-card-blue">
                <div class="inkling-callout-emoji">💡</div>
                <div class="inkling-callout-text"><code>x</code></div>
              </div>
            `,
          )
        },
      ),
    )

    it(
      'keeps the editor inline-code serialization attributes',
      editorTest(
        () => editor,
        async function () {
          dataset.calloutText = '<code spellcheck="false" style="white-space: pre-wrap;">inline code</code>'

          const node = $createBaseCalloutNode(dataset)
          const result = node.exportDOM(editor, exportOptions)
          const element = result.element as HTMLElement

          await expectPrettifiedHtml(
            element.outerHTML,
            html`
              <div class="inkling-card inkling-callout-card inkling-callout-card-blue">
                <div class="inkling-callout-emoji">💡</div>
                <div class="inkling-callout-text">
                  <code spellcheck="false" style="white-space: pre-wrap">inline code</code>
                </div>
              </div>
            `,
          )
        },
      ),
    )

    it(
      'keeps allowed formatting tags and unwraps disallowed tags',
      editorTest(
        () => editor,
        async function () {
          dataset.calloutText = '<strong>bold</strong><div><script>alert(1)</script>text</div>'

          const node = $createBaseCalloutNode(dataset)
          const result = node.exportDOM(editor, exportOptions)
          const element = result.element as HTMLElement

          await expectPrettifiedHtml(
            element.outerHTML,
            html`
              <div class="inkling-card inkling-callout-card inkling-callout-card-blue">
                <div class="inkling-callout-emoji">💡</div>
                <div class="inkling-callout-text"><strong>bold</strong>alert(1)text</div>
              </div>
            `,
          )
        },
      ),
    )

    it(
      'unwraps disallowed tags nested inside an allowed tag',
      editorTest(
        () => editor,
        async function () {
          dataset.calloutText = '<strong>keep<div><span>deep</span></div></strong>'

          const node = $createBaseCalloutNode(dataset)
          const result = node.exportDOM(editor, exportOptions)
          const element = result.element as HTMLElement

          await expectPrettifiedHtml(
            element.outerHTML,
            html`
              <div class="inkling-card inkling-callout-card inkling-callout-card-blue">
                <div class="inkling-callout-emoji">💡</div>
                <div class="inkling-callout-text"><strong>keepdeep</strong></div>
              </div>
            `,
          )
        },
      ),
    )

    it(
      'unwraps deeply nested disallowed tags and keeps their text',
      editorTest(
        () => editor,
        async function () {
          dataset.calloutText = '<div><span><script>alert(1)</script>text</span></div>'

          const node = $createBaseCalloutNode(dataset)
          const result = node.exportDOM(editor, exportOptions)
          const element = result.element as HTMLElement

          await expectPrettifiedHtml(
            element.outerHTML,
            html`
              <div class="inkling-card inkling-callout-card inkling-callout-card-blue">
                <div class="inkling-callout-emoji">💡</div>
                <div class="inkling-callout-text">alert(1)text</div>
              </div>
            `,
          )
        },
      ),
    )
  })

  describe('importDOM', function () {
    it(
      'parses callout card',
      editorTest(
        () => editor,
        async function () {
          const document = createDocument(html`
            <div class="inkling-card inkling-callout-card inkling-callout-card-red">
              <div class="inkling-callout-emoji">💡</div>
              <div class="inkling-callout-text">This is a callout</div>
            </div>
          `)
          const nodes = $generateNodesFromDOM(editor, document) as BaseCalloutNode[]
          expect(nodes.length).toBe(1)
          expect(nodes[0].backgroundColor).toBe('red')
          expect(nodes[0].calloutText).toBe('This is a callout')
          expect(nodes[0].calloutEmoji).toBe('\u{1F4A1}')
        },
      ),
    )

    it(
      'parses callout card with no emoji',
      editorTest(
        () => editor,
        async function () {
          const document = createDocument(html`
            <div class="inkling-card inkling-callout-card inkling-callout-card-red">
              <div class="inkling-callout-text">This is a callout</div>
            </div>
          `)
          const nodes = $generateNodesFromDOM(editor, document) as BaseCalloutNode[]
          expect(nodes.length).toBe(1)
          expect(nodes[0].backgroundColor).toBe('red')
          expect(nodes[0].calloutText).toBe('This is a callout')
          expect(nodes[0].calloutEmoji).toBe('')
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
                type: 'callout',
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
            const [calloutNode] = $getRoot().getChildren() as BaseCalloutNode[]
            expect(calloutNode.calloutText).toBe(dataset.calloutText)
            expect(calloutNode.calloutEmoji).toBe(dataset.calloutEmoji)
            expect(calloutNode.backgroundColor).toBe(dataset.backgroundColor)
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
          const node = $createBaseCalloutNode()
          expect(node.getTextContent()).toBe('')

          node.calloutText = 'Test'

          expect(node.getTextContent()).toBe('Test\n\n')
        },
      ),
    )
  })
})
