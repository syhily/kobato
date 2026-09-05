import { createHeadlessEditor } from '@lexical/headless'
import { $generateNodesFromDOM } from '@lexical/html'
import { $getRoot, type ElementNode, type LexicalEditor } from 'lexical'

import { expectPrettifiedHtml } from '#/nodes-base/test-utils/assertions'
import { createDocument, dom, html } from '#/nodes-base/test-utils/index'
import { editorTest } from '#/utils/test-editor'
import { BaseCodeBlockNode, $createBaseCodeBlockNode, $isCodeBlockNode } from '@/nodes/base/index'

const editorNodes = [BaseCodeBlockNode]

function unwrapCodeBlock(nodes: unknown[]): BaseCodeBlockNode {
  const firstNode = nodes[0] as BaseCodeBlockNode | ElementNode
  if ((firstNode as ElementNode).getType?.() === 'paragraph') {
    return (firstNode as ElementNode).getChildren()[0] as BaseCodeBlockNode
  }
  return firstNode as BaseCodeBlockNode
}

describe('BaseCodeBlockNode', function () {
  let dataset: Record<string, unknown>
  let editor: LexicalEditor
  let code: string
  let language: string
  let caption: string
  let exportOptions: Record<string, unknown>

  beforeEach(function () {
    editor = createHeadlessEditor({ nodes: editorNodes })

    code = '<script></script>'
    language = 'javascript'
    caption = 'A code block'

    dataset = {
      code,
      language,
      caption,
    }

    exportOptions = {
      dom,
    }
  })

  it(
    'matches node with $isCodeBlockNode',
    editorTest(
      () => editor,
      async function () {
        const codeBlockNode = $createBaseCodeBlockNode({ language, code, caption })
        expect($isCodeBlockNode(codeBlockNode)).toBe(true)
      },
    ),
  )

  describe('importJSON', function () {
    it('imports all properties', () =>
      new Promise<void>((resolve, reject) => {
        const serialized = `
                {
                    "root": {
                        "children": [
                            {
                                "type": "codeblock",
                                "code": "<?php echo 'Hello World'; ?>",
                                "language": "php",
                                "caption": "Your first PHP enabled page"
                            }
                        ],
                        "direction": null,
                        "format": "",
                        "indent": 0,
                        "type": "root",
                        "version": 1
                    }
                }
            `

        const editorState = editor.parseEditorState(serialized)

        editorState.read(() => {
          try {
            const codeBlockNode = $getRoot().getChildren()[0] as BaseCodeBlockNode
            expect(codeBlockNode.code).toBe(`<?php echo 'Hello World'; ?>`)
            expect(codeBlockNode.language).toBe('php')
            expect(codeBlockNode.caption).toBe('Your first PHP enabled page')
            resolve()
          } catch (e) {
            reject(e)
          }
        })
      }))
  })

  describe('exportJSON', function () {
    it('exports all properties', () =>
      new Promise<void>((resolve, reject) => {
        editor.update(
          () => {
            try {
              const codeBlockNode = $createBaseCodeBlockNode({ code, language, caption })
              $getRoot().append(codeBlockNode)
            } catch (e) {
              reject(e)
            }
          },
          { discrete: true },
        )

        const parsedExport = JSON.parse(JSON.stringify(editor.getEditorState()))

        expect(parsedExport.root.children).toEqual([
          {
            type: 'codeblock',
            version: 1,
            code: '<script></script>',
            language: 'javascript',
            caption: 'A code block',
            highlightedHtml: '',
          },
        ])
        resolve()
      }))
  })

  describe('data access', function () {
    it(
      'has getters for all properties',
      editorTest(
        () => editor,
        async function () {
          const codeBlockNode = $createBaseCodeBlockNode({ language, code, caption })

          expect(codeBlockNode.code).toBe('<script></script>')
          expect(codeBlockNode.language).toBe('javascript')
          expect(codeBlockNode.caption).toBe('A code block')
        },
      ),
    )

    it(
      'has setters for all properties',
      editorTest(
        () => editor,
        async function () {
          const codeBlockNode = $createBaseCodeBlockNode({ language: '', code: '', caption: '' })

          expect(codeBlockNode.language).toBe('')
          codeBlockNode.language = 'javascript'
          expect(codeBlockNode.language).toBe('javascript')

          expect(codeBlockNode.code).toBe('')
          codeBlockNode.code = '<script></script>'
          expect(codeBlockNode.code).toBe('<script></script>')

          expect(codeBlockNode.caption).toBe('')
          codeBlockNode.caption = 'A code block'
          expect(codeBlockNode.caption).toBe('A code block')
        },
      ),
    )

    it(
      'has getDataset() convenience method',
      editorTest(
        () => editor,
        async function () {
          const codeBlockNode = $createBaseCodeBlockNode({ language, code, caption })
          const codeBlockNodeDataset = codeBlockNode.getDataset()

          expect(codeBlockNodeDataset).toEqual({
            code: '<script></script>',
            language: 'javascript',
            caption: 'A code block',
            highlightedHtml: '',
          })
        },
      ),
    )
  })

  describe('highlightedHtml artifact slot', function () {
    const artifact = '<span style="--shiki-light:#657b83">const a = 1</span>'

    it(
      'keeps a construction-filled artifact',
      editorTest(
        () => editor,
        async function () {
          const codeBlockNode = $createBaseCodeBlockNode({
            code: 'const a = 1',
            language: 'javascript',
            highlightedHtml: artifact,
          })

          expect(codeBlockNode.highlightedHtml).toBe(artifact)
        },
      ),
    )

    it(
      'clears the artifact when code changes',
      editorTest(
        () => editor,
        async function () {
          const codeBlockNode = $createBaseCodeBlockNode({
            code: 'const a = 1',
            language: 'javascript',
            highlightedHtml: artifact,
          })

          codeBlockNode.code = 'const b = 2'

          expect(codeBlockNode.code).toBe('const b = 2')
          expect(codeBlockNode.highlightedHtml).toBe('')
        },
      ),
    )

    it(
      'clears the artifact when language changes',
      editorTest(
        () => editor,
        async function () {
          const codeBlockNode = $createBaseCodeBlockNode({
            code: 'const a = 1',
            language: 'javascript',
            highlightedHtml: artifact,
          })

          codeBlockNode.language = 'typescript'

          expect(codeBlockNode.language).toBe('typescript')
          expect(codeBlockNode.highlightedHtml).toBe('')
        },
      ),
    )

    it(
      'keeps the artifact when the same value is reassigned',
      editorTest(
        () => editor,
        async function () {
          const codeBlockNode = $createBaseCodeBlockNode({
            code: 'const a = 1',
            language: 'javascript',
            highlightedHtml: artifact,
          })

          codeBlockNode.code = 'const a = 1'
          codeBlockNode.language = 'javascript'

          expect(codeBlockNode.highlightedHtml).toBe(artifact)
        },
      ),
    )

    it('round-trips the artifact through serialization', () =>
      new Promise<void>((resolve, reject) => {
        editor.update(
          () => {
            try {
              const codeBlockNode = $createBaseCodeBlockNode({
                code: 'const a = 1',
                language: 'javascript',
                highlightedHtml: artifact,
              })
              $getRoot().append(codeBlockNode)
            } catch (e) {
              reject(e)
            }
          },
          { discrete: true },
        )

        const parsedExport = JSON.parse(JSON.stringify(editor.getEditorState()))
        expect(parsedExport.root.children[0].highlightedHtml).toBe(artifact)

        const roundTrippedEditor = createHeadlessEditor({ nodes: editorNodes })
        const roundTrippedState = roundTrippedEditor.parseEditorState(JSON.stringify(parsedExport))
        roundTrippedState.read(() => {
          try {
            const codeBlockNode = $getRoot().getChildren()[0] as BaseCodeBlockNode
            expect(codeBlockNode.code).toBe('const a = 1')
            expect(codeBlockNode.language).toBe('javascript')
            expect(codeBlockNode.highlightedHtml).toBe(artifact)
            resolve()
          } catch (e) {
            reject(e)
          }
        })
      }))
  })

  describe('isEmpty()', function () {
    it(
      'returns true if markdown is empty',
      editorTest(
        () => editor,
        async function () {
          const codeBlockNode = $createBaseCodeBlockNode(dataset)

          expect(codeBlockNode.isEmpty()).toBe(false)
          codeBlockNode.code = ''
          expect(codeBlockNode.isEmpty()).toBe(true)
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
          expect(BaseCodeBlockNode.getType()).toBe('codeblock')
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
          const codeBlockNode = $createBaseCodeBlockNode(dataset)
          const codeBlockNodeDataset = codeBlockNode.getDataset()
          const clone = BaseCodeBlockNode.clone(codeBlockNode)
          const cloneDataset = clone.getDataset()

          expect(cloneDataset).toEqual({ ...codeBlockNodeDataset })
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
          expect(BaseCodeBlockNode.urlTransformMap).toEqual({
            caption: 'html',
            highlightedHtml: 'html',
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
          const codeBlockNode = $createBaseCodeBlockNode(dataset)
          expect(codeBlockNode.hasEditMode()).toBe(true)
        },
      ),
    )
  })

  describe('exportDOM', function () {
    it(
      'renders and escapes',
      editorTest(
        () => editor,
        async function () {
          const codeBlockNode = $createBaseCodeBlockNode({ code })
          const { element } = codeBlockNode.exportDOM(editor, exportOptions)
          const el = element as HTMLElement

          await expectPrettifiedHtml(el.outerHTML, html` <pre><code>&lt;script&gt;&lt;/script&gt;</code></pre> `)
        },
      ),
    )

    it(
      'renders language class if provided',
      editorTest(
        () => editor,
        async function () {
          const codeBlockNode = $createBaseCodeBlockNode({ language, code })
          const { element } = codeBlockNode.exportDOM(editor, exportOptions)
          const el = element as HTMLElement

          await expectPrettifiedHtml(
            el.outerHTML,
            html` <pre><code class="language-javascript">&lt;script&gt;&lt;/script&gt;</code></pre> `,
          )
        },
      ),
    )

    it(
      'renders empty span when code is undefined or empty',
      editorTest(
        () => editor,
        async function () {
          const codeBlockNode = $createBaseCodeBlockNode({ code: '' })
          const { element } = codeBlockNode.exportDOM(editor, exportOptions)
          const el = element as HTMLElement

          expect(el.outerHTML).toBe('<span></span>')
        },
      ),
    )

    it(
      'renders a figure if a caption is provided',
      editorTest(
        () => editor,
        async function () {
          const codeBlockNode = $createBaseCodeBlockNode({ language, code, caption })
          const { element } = codeBlockNode.exportDOM(editor, exportOptions)
          const el = element as HTMLElement

          await expectPrettifiedHtml(
            el.outerHTML,
            html`
              <figure class="inkling-card inkling-code-card inkling-card-hascaption">
                <pre><code class="language-javascript">&lt;script&gt;&lt;/script&gt;</code></pre>
                <figcaption>A code block</figcaption>
              </figure>
            `,
          )
        },
      ),
    )

    it(
      'renders the prerendered artifact verbatim when provided',
      editorTest(
        () => editor,
        async function () {
          const codeBlockNode = $createBaseCodeBlockNode({
            code: 'const a = 1',
            language: 'javascript',
            highlightedHtml:
              '<span style="--shiki-light:#657b83">const</span> <span style="--shiki-light:#859900">a</span>',
          })
          const { element } = codeBlockNode.exportDOM(editor, exportOptions)
          const el = element as HTMLElement

          await expectPrettifiedHtml(
            el.outerHTML,
            html`
              <pre><code class="language-javascript" data-language="javascript" data-code="const a = 1"><span style="--shiki-light:#657b83">const</span> <span style="--shiki-light:#859900">a</span></code></pre>
            `,
          )
        },
      ),
    )

    it(
      'renders the artifact inside a figure when a caption is provided',
      editorTest(
        () => editor,
        async function () {
          const codeBlockNode = $createBaseCodeBlockNode({
            code: 'const a = 1',
            language: 'javascript',
            caption,
            highlightedHtml: '<span style="--shiki-light:#657b83">const</span>',
          })
          const { element } = codeBlockNode.exportDOM(editor, exportOptions)
          const el = element as HTMLElement

          await expectPrettifiedHtml(
            el.outerHTML,
            html`
              <figure class="inkling-card inkling-code-card inkling-card-hascaption">
                <pre><code class="language-javascript" data-language="javascript" data-code="const a = 1"><span style="--shiki-light:#657b83">const</span></code></pre>
                <figcaption>A code block</figcaption>
              </figure>
            `,
          )
        },
      ),
    )

    it(
      'sanitizes the artifact but keeps span styles',
      editorTest(
        () => editor,
        async function () {
          const codeBlockNode = $createBaseCodeBlockNode({
            code: 'alert(1)',
            language: 'javascript',
            highlightedHtml:
              '<span style="--shiki-light:#657b83">alert(1)</span><script>alert(2)</script><span style="color:#859900" onclick="alert(3)">x</span>',
          })
          const { element } = codeBlockNode.exportDOM(editor, exportOptions)
          const el = element as HTMLElement

          expect(el.outerHTML).not.toContain('<script')
          expect(el.outerHTML).not.toContain('onclick')
          expect(el.outerHTML).toContain('<span style="--shiki-light:#657b83">alert(1)</span>')
          expect(el.outerHTML).toContain('<span style="color:#859900">x</span>')
        },
      ),
    )
  })

  it(
    'sanitizes caption HTML',
    editorTest(
      () => editor,
      async function () {
        const codeBlockNode = $createBaseCodeBlockNode({
          language,
          code,
          caption: 'Caption \u003cscript\u003ealert(1)\u003c/script\u003e \u003cimg src=x onerror=alert(1)\u003e',
        })
        const { element } = codeBlockNode.exportDOM(editor, exportOptions)
        const html = (element as HTMLElement).outerHTML

        expect(html).not.toContain('\u003cscript')
        expect(html).not.toContain('onerror')
        expect(html).toContain('Caption')
      },
    ),
  )

  describe('importDOM', function () {
    it(
      'parses PRE>CODE inside FIGURE into code card',
      editorTest(
        () => editor,
        async function () {
          const document = createDocument(html`
            <figure>
              <pre><code>Test code</code></pre>
            </figure>
          `)
          const nodes = $generateNodesFromDOM(editor, document)

          expect(nodes.length).toBe(1)
          const codeBlock = unwrapCodeBlock(nodes)
          expect(codeBlock.code).toBe('Test code')
          expect(codeBlock.language).toBe('')
          expect(codeBlock.caption).toBe('')
        },
      ),
    )

    it(
      'parses PRE>CODE inside FIGURE with FIGCAPTION into code card',
      editorTest(
        () => editor,
        async function () {
          const document = createDocument(html`
            <figure>
              <pre><code>Test code</code></pre>
              <figcaption>Test caption</figcaption>
            </figure>
          `)
          const nodes = $generateNodesFromDOM(editor, document) as BaseCodeBlockNode[]

          expect(nodes.length).toBe(1)
          expect(nodes[0].code).toBe('Test code')
          expect(nodes[0].caption).toBe('Test caption')
          expect(nodes[0].language).toBe('')
        },
      ),
    )

    it(
      'extracts language from pre class name for FIGURE>PRE>CODE',
      editorTest(
        () => editor,
        async function () {
          const document = createDocument(html`
            <figure>
              <pre class="language-js"><code>Test code</code></pre>
              <figcaption>Test caption</figcaption>
            </figure>
          `)
          const nodes = $generateNodesFromDOM(editor, document) as BaseCodeBlockNode[]

          expect(nodes.length).toBe(1)
          expect(nodes[0].code).toBe('Test code')
          expect(nodes[0].caption).toBe('Test caption')
          expect(nodes[0].language).toBe('js')
        },
      ),
    )

    it(
      'extracts language from code class name for FIGURE>PRE>CODE',
      editorTest(
        () => editor,
        async function () {
          const document = createDocument(html`
            <figure>
              <pre><code class="language-js">Test code</code></pre>
              <figcaption>Test caption</figcaption>
            </figure>
          `)
          const nodes = $generateNodesFromDOM(editor, document) as BaseCodeBlockNode[]

          expect(nodes.length).toBe(1)
          expect(nodes[0].code).toBe('Test code')
          expect(nodes[0].caption).toBe('Test caption')
          expect(nodes[0].language).toBe('js')
        },
      ),
    )

    it(
      'correctly skips if there is no pre tag',
      editorTest(
        () => editor,
        async function () {
          const document = createDocument(html`
            <figure>
              <div><span class="nothing-to-see-here"></span></div>
            </figure>
          `)
          const nodes = $generateNodesFromDOM(editor, document)

          expect(nodes.length).toBe(1)
          expect(nodes[0].getType()).toBe('paragraph')
          expect((nodes[0] as ElementNode).getChildren().length).toBe(1)
          expect((nodes[0] as ElementNode).getChildren()[0].getType()).toBe('linebreak')
        },
      ),
    )

    it(
      'parses PRE>CODE into code card',
      editorTest(
        () => editor,
        async function () {
          const document = createDocument(html`
            <figure>
              <pre><code>Test code</code></pre>
            </figure>
          `)
          const nodes = $generateNodesFromDOM(editor, document)

          expect(nodes.length).toBe(1)
          const codeBlock = unwrapCodeBlock(nodes)
          expect(codeBlock.code).toBe('Test code')
          expect(codeBlock.language).toBe('')
          expect(codeBlock.caption).toBe('')
        },
      ),
    )

    it(
      'extracts language from pre class name for PRE>CODE',
      editorTest(
        () => editor,
        async function () {
          const document = createDocument(html`
            <figure>
              <pre class="language-javascript"><code>Test code</code></pre>
            </figure>
          `)
          const nodes = $generateNodesFromDOM(editor, document)

          expect(nodes.length).toBe(1)
          const codeBlock = unwrapCodeBlock(nodes)
          expect(codeBlock.code).toBe('Test code')
          expect(codeBlock.language).toBe('javascript')
          expect(codeBlock.caption).toBe('')
        },
      ),
    )

    it(
      'extracts language from code class name for PRE>CODE',
      editorTest(
        () => editor,
        async function () {
          const document = createDocument(html`
            <figure>
              <pre><code class="language-ruby">Test code</code></pre>
            </figure>
          `)
          const nodes = $generateNodesFromDOM(editor, document)

          expect(nodes.length).toBe(1)
          const codeBlock = unwrapCodeBlock(nodes)
          expect(codeBlock.code).toBe('Test code')
          expect(codeBlock.language).toBe('ruby')
          expect(codeBlock.caption).toBe('')
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
          const node = $createBaseCodeBlockNode()
          expect(node.getTextContent()).toBe('')

          node.code = '<script>const test = true;</script>'
          node.caption = 'Test caption'

          expect(node.getTextContent()).toBe('<script>const test = true;</script>\nTest caption\n\n')
        },
      ),
    )
  })
})
