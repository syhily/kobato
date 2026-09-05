import type { LexicalEditor } from 'lexical'

import { createHeadlessEditor } from '@lexical/headless'
import { $generateNodesFromDOM } from '@lexical/html'
import { $getRoot } from 'lexical'

import { expectPrettifiedHtml } from '#/nodes-base/test-utils/assertions'
import { createDocument, dom, html } from '#/nodes-base/test-utils/index'
import { editorTest } from '#/utils/test-editor'
import { BaseButtonNode, $createBaseButtonNode, $isButtonNode } from '@/nodes/base/index'

const editorNodes = [BaseButtonNode]

describe('BaseButtonNode', function () {
  let editor: LexicalEditor
  let dataset: { buttonText: string; buttonUrl: string; alignment: string }
  let exportOptions: Record<string, unknown>

  beforeEach(function () {
    editor = createHeadlessEditor({ nodes: editorNodes })
    dataset = {
      buttonText: 'click me',
      buttonUrl: 'http://blog.com/post1',
      alignment: 'center',
    }
    exportOptions = {
      dom,
    }
  })

  it(
    'matches node with $isButtonNode',
    editorTest(
      () => editor,
      async function () {
        const buttonNode = $createBaseButtonNode(dataset)
        expect($isButtonNode(buttonNode)).toBe(true)
      },
    ),
  )

  describe('data access', function () {
    it(
      'has getters for all properties',
      editorTest(
        () => editor,
        async function () {
          const buttonNode = $createBaseButtonNode(dataset)

          expect(buttonNode.buttonUrl).toBe(dataset.buttonUrl)
          expect(buttonNode.buttonText).toBe(dataset.buttonText)
          expect(buttonNode.alignment).toBe(dataset.alignment)
        },
      ),
    )

    it(
      'has setters for all properties',
      editorTest(
        () => editor,
        async function () {
          const buttonNode = $createBaseButtonNode()

          expect(buttonNode.buttonUrl).toBe('')
          buttonNode.buttonUrl = 'http://someblog.com/somepost'
          expect(buttonNode.buttonUrl).toBe('http://someblog.com/somepost')

          expect(buttonNode.buttonText).toBe('')
          buttonNode.buttonText = 'button text'
          expect(buttonNode.buttonText).toBe('button text')

          expect(buttonNode.alignment).toBe('center')
          buttonNode.alignment = 'left'
          expect(buttonNode.alignment).toBe('left')
        },
      ),
    )

    it(
      'has getDataset() convenience method',
      editorTest(
        () => editor,
        async function () {
          const buttonNode = $createBaseButtonNode(dataset)
          const buttonNodeDataset = buttonNode.getDataset()

          expect(buttonNodeDataset).toEqual({
            ...dataset,
          })
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
          expect(BaseButtonNode.getType()).toBe('button')
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
          const buttonNode = $createBaseButtonNode(dataset)
          const buttonNodeDataset = buttonNode.getDataset()
          const clone = BaseButtonNode.clone(buttonNode)
          const cloneDataset = clone.getDataset()

          expect(cloneDataset).toEqual({ ...buttonNodeDataset })
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
          expect(BaseButtonNode.urlTransformMap).toEqual({
            buttonUrl: 'url',
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
          const buttonNode = $createBaseButtonNode(dataset)
          expect(buttonNode.hasEditMode()).toBe(true)
        },
      ),
    )
  })

  describe('exportDOM', function () {
    it(
      'creates a button card',
      editorTest(
        () => editor,
        async function () {
          const buttonNode = $createBaseButtonNode(dataset)
          const result = buttonNode.exportDOM(editor, exportOptions)
          const element = result.element as HTMLElement

          await expectPrettifiedHtml(
            element.outerHTML,
            html`<div class="inkling-card inkling-button-card inkling-align-center">
              <a href="http://blog.com/post1" class="inkling-btn inkling-btn-accent">click me</a>
            </div>`,
          )
        },
      ),
    )

    it(
      'renders an empty span with a missing buttonUrl',
      editorTest(
        () => editor,
        async function () {
          const buttonNode = $createBaseButtonNode()
          const result = buttonNode.exportDOM(editor, exportOptions)
          const element = result.element as HTMLElement

          expect(element.outerHTML).toBe('<span></span>')
        },
      ),
    )

    it(
      'rejects an unsafe button URL',
      editorTest(
        () => editor,
        function () {
          const buttonNode = $createBaseButtonNode({
            buttonText: 'click me',
            buttonUrl: 'javascript:alert(1)',
            alignment: 'center',
          })
          const result = buttonNode.exportDOM(editor, exportOptions)
          const element = result.element as HTMLElement

          expect(element.outerHTML).toBe('<span></span>')
        },
      ),
    )

    it(
      'escapes button text markup',
      editorTest(
        () => editor,
        function () {
          const buttonNode = $createBaseButtonNode({
            buttonText: '<script>alert(1)</script>',
            buttonUrl: 'https://example.com/',
            alignment: 'center',
          })
          const result = buttonNode.exportDOM(editor, exportOptions)
          const element = result.element as HTMLElement

          expect(element.innerHTML).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
          expect(element.innerHTML).not.toContain('<script>alert(1)</script>')
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
          const buttonNode = $createBaseButtonNode(dataset)
          const json = buttonNode.exportJSON()

          expect(json).toEqual({
            type: 'button',
            version: 1,
            buttonUrl: dataset.buttonUrl,
            buttonText: dataset.buttonText,
            alignment: dataset.alignment,
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
                type: 'button',
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
            const [buttonNode] = $getRoot().getChildren() as BaseButtonNode[]

            expect(buttonNode.buttonUrl).toBe(dataset.buttonUrl)
            expect(buttonNode.buttonText).toBe(dataset.buttonText)
            expect(buttonNode.alignment).toBe(dataset.alignment)

            resolve()
          } catch (e) {
            reject(e)
          }
        })
      }))
  })

  describe('static properties', function () {
    it(
      'getType',
      editorTest(
        () => editor,
        async function () {
          expect(BaseButtonNode.getType()).toBe('button')
        },
      ),
    )

    it(
      'urlTransformMap',
      editorTest(
        () => editor,
        async function () {
          expect(BaseButtonNode.urlTransformMap).toEqual({
            buttonUrl: 'url',
          })
        },
      ),
    )
  })

  describe('importDOM', function () {
    it(
      'parses button card',
      editorTest(
        () => editor,
        async function () {
          const document = createDocument(html`
            <div class="inkling-card inkling-button-card inkling-align-center">
              <a href="http://someblog.com/somepost" class="inkling-btn inkling-btn-accent">click me</a>
            </div>
          `)
          const nodes = $generateNodesFromDOM(editor, document) as BaseButtonNode[]
          expect(nodes.length).toBe(1)
          expect(nodes[0].buttonUrl).toBe('http://someblog.com/somepost')
          expect(nodes[0].buttonText).toBe('click me')
          expect(nodes[0].alignment).toBe('center')
        },
      ),
    )

    it(
      'preserves relative urls in content',
      editorTest(
        () => editor,
        async function () {
          const document = createDocument(html`
            <div class="inkling-card inkling-button-card inkling-align-center">
              <a href="#/portal/signup" class="inkling-btn inkling-btn-accent">Subscribe 1</a>
            </div>
          `)
          const nodes = $generateNodesFromDOM(editor, document) as BaseButtonNode[]
          expect(nodes.length).toBe(1)
          expect(nodes[0].buttonUrl).toBe('#/portal/signup')
          expect(nodes[0].buttonText).toBe('Subscribe 1')
          expect(nodes[0].alignment).toBe('center')
        },
      ),
    )
  })

  describe('getTextContent', function () {
    it(
      'returns contents',
      editorTest(
        () => editor,
        async function () {
          const node = $createBaseButtonNode()
          node.buttonText = 'Testing'
          node.buttonUrl = 'http://someblog.com/somepost'

          // button nodes don't have text content
          expect(node.getTextContent()).toBe('')
        },
      ),
    )
  })
})
