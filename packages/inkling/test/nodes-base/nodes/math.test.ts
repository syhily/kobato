import { createHeadlessEditor } from '@lexical/headless'
import { $getRoot, type LexicalEditor } from 'lexical'

import { expectPrettifiedHtml } from '#/nodes-base/test-utils/assertions'
import { dom, html } from '#/nodes-base/test-utils/index'
import { editorTest } from '#/utils/test-editor'
import { BaseMathNode, $createBaseMathNode, $isMathNode } from '@/nodes/base/index'

const editorNodes = [BaseMathNode]

describe('BaseMathNode', function () {
  let editor: LexicalEditor
  let exportOptions: Record<string, unknown>

  beforeEach(function () {
    editor = createHeadlessEditor({ nodes: editorNodes })
    exportOptions = { dom }
  })

  it(
    'matches node with $isMathNode',
    editorTest(
      () => editor,
      async function () {
        const mathNode = $createBaseMathNode({ tex: 'x^2' })
        expect($isMathNode(mathNode)).toBe(true)
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
                                "type": "math",
                                "tex": "x^2 + y^2 = z^2",
                                "mathml": "<math><mi>x</mi></math>",
                                "svg": "<svg><path d='M0 0'/></svg>"
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
            const mathNode = $getRoot().getChildren()[0] as BaseMathNode
            expect(mathNode.tex).toBe('x^2 + y^2 = z^2')
            expect(mathNode.mathml).toBe('<math><mi>x</mi></math>')
            expect(mathNode.svg).toBe("<svg><path d='M0 0'/></svg>")
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
              const mathNode = $createBaseMathNode({ tex: 'x^2', mathml: '<math/>', svg: '<svg/>' })
              $getRoot().append(mathNode)
            } catch (e) {
              reject(e)
            }
          },
          { discrete: true },
        )

        const parsedExport = JSON.parse(JSON.stringify(editor.getEditorState()))

        expect(parsedExport.root.children).toEqual([
          {
            type: 'math',
            version: 1,
            tex: 'x^2',
            mathml: '<math/>',
            svg: '<svg/>',
          },
        ])
        resolve()
      }))
  })

  describe('artifact slots', function () {
    const artifact = '<svg viewBox="0 0 10 10"><path d="M0 0h10v10z"/></svg>'

    it(
      'keeps a construction-filled artifact',
      editorTest(
        () => editor,
        async function () {
          const mathNode = $createBaseMathNode({ tex: 'x^2', svg: artifact })

          expect(mathNode.svg).toBe(artifact)
        },
      ),
    )

    it(
      'clears the artifacts when tex changes',
      editorTest(
        () => editor,
        async function () {
          const mathNode = $createBaseMathNode({ tex: 'x^2', mathml: '<math/>', svg: artifact })

          mathNode.tex = 'y^2'

          expect(mathNode.tex).toBe('y^2')
          expect(mathNode.mathml).toBe('')
          expect(mathNode.svg).toBe('')
        },
      ),
    )

    it(
      'keeps the artifacts when the same tex is reassigned',
      editorTest(
        () => editor,
        async function () {
          const mathNode = $createBaseMathNode({ tex: 'x^2', mathml: '<math/>', svg: artifact })

          mathNode.tex = 'x^2'

          expect(mathNode.mathml).toBe('<math/>')
          expect(mathNode.svg).toBe(artifact)
        },
      ),
    )

    it('round-trips the artifacts through serialization', () =>
      new Promise<void>((resolve, reject) => {
        editor.update(
          () => {
            try {
              const mathNode = $createBaseMathNode({ tex: 'x^2', mathml: '<math/>', svg: artifact })
              $getRoot().append(mathNode)
            } catch (e) {
              reject(e)
            }
          },
          { discrete: true },
        )

        const parsedExport = JSON.parse(JSON.stringify(editor.getEditorState()))
        expect(parsedExport.root.children[0].svg).toBe(artifact)

        const roundTrippedEditor = createHeadlessEditor({ nodes: editorNodes })
        const roundTrippedState = roundTrippedEditor.parseEditorState(JSON.stringify(parsedExport))
        roundTrippedState.read(() => {
          try {
            const mathNode = $getRoot().getChildren()[0] as BaseMathNode
            expect(mathNode.tex).toBe('x^2')
            expect(mathNode.mathml).toBe('<math/>')
            expect(mathNode.svg).toBe(artifact)
            resolve()
          } catch (e) {
            reject(e)
          }
        })
      }))
  })

  describe('isEmpty()', function () {
    it(
      'returns true if tex is empty',
      editorTest(
        () => editor,
        async function () {
          const mathNode = $createBaseMathNode({ tex: 'x^2' })

          expect(mathNode.isEmpty()).toBe(false)
          mathNode.tex = ''
          expect(mathNode.isEmpty()).toBe(true)
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
          expect(BaseMathNode.getType()).toBe('math')
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
          const mathNode = $createBaseMathNode({ tex: 'x^2', mathml: '<math/>', svg: '<svg/>' })
          const clone = BaseMathNode.clone(mathNode)

          expect(clone.getDataset()).toEqual({ ...mathNode.getDataset() })
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
          expect(BaseMathNode.urlTransformMap).toEqual({
            mathml: 'html',
            svg: 'html',
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
          const mathNode = $createBaseMathNode()
          expect(mathNode.hasEditMode()).toBe(true)
        },
      ),
    )
  })

  describe('exportDOM', function () {
    // The render priority mirrors kobato pt-html.ts:254-265:
    // svg verbatim > mathml verbatim > escaped <pre><code>tex</code></pre>.

    it(
      'renders the svg artifact verbatim when provided',
      editorTest(
        () => editor,
        async function () {
          const mathNode = $createBaseMathNode({
            tex: 'x^2',
            mathml: '<math><mi>y</mi></math>',
            svg: '<svg viewBox="0 0 10 10"><path d="M0 0h10v10z"/></svg>',
          })
          const { element } = mathNode.exportDOM(editor, exportOptions)
          const el = element as HTMLElement

          await expectPrettifiedHtml(
            el.outerHTML,
            html`
              <div class="inkling-card inkling-math-card">
                <svg viewBox="0 0 10 10"><path d="M0 0h10v10z"></path></svg>
              </div>
            `,
          )
        },
      ),
    )

    it(
      'renders the mathml artifact verbatim when no svg is present',
      editorTest(
        () => editor,
        async function () {
          const mathNode = $createBaseMathNode({ tex: 'x^2', mathml: '<math><mi>x</mi><msup><mi>2</mi></msup></math>' })
          const { element } = mathNode.exportDOM(editor, exportOptions)
          const el = element as HTMLElement

          await expectPrettifiedHtml(
            el.outerHTML,
            html`
              <div class="inkling-card inkling-math-card">
                <math
                  ><mi>x</mi><msup><mi>2</mi></msup></math
                >
              </div>
            `,
          )
        },
      ),
    )

    it(
      'falls back to the escaped tex source when no artifact is present',
      editorTest(
        () => editor,
        async function () {
          const mathNode = $createBaseMathNode({ tex: 'a < b & "c"' })
          const { element } = mathNode.exportDOM(editor, exportOptions)
          const el = element as HTMLElement

          await expectPrettifiedHtml(el.outerHTML, html` <pre><code>a &lt; b &amp; "c"</code></pre> `)
        },
      ),
    )

    it(
      'renders empty span when tex is empty',
      editorTest(
        () => editor,
        async function () {
          const mathNode = $createBaseMathNode({ tex: '' })
          const { element } = mathNode.exportDOM(editor, exportOptions)
          const el = element as HTMLElement

          expect(el.outerHTML).toBe('<span></span>')
        },
      ),
    )

    it(
      'sanitizes the artifact but keeps the math vocabulary',
      editorTest(
        () => editor,
        async function () {
          const mathNode = $createBaseMathNode({
            tex: 'alert(1)',
            svg: '<svg viewBox="0 0 10 10"><path d="M0 0z"/></svg><script>alert(2)</script>',
          })
          const { element } = mathNode.exportDOM(editor, exportOptions)
          const el = element as HTMLElement

          expect(el.outerHTML).not.toContain('<script')
          expect(el.outerHTML).toContain('<svg viewBox="0 0 10 10"><path d="M0 0z"></path></svg>')
        },
      ),
    )
  })

  describe('getTextContent', function () {
    it(
      'returns the tex source',
      editorTest(
        () => editor,
        async function () {
          const mathNode = $createBaseMathNode()
          expect(mathNode.getTextContent()).toBe('')

          mathNode.tex = 'x^2'

          expect(mathNode.getTextContent()).toBe('x^2\n\n')
        },
      ),
    )
  })
})
