import { createHeadlessEditor } from '@lexical/headless'
import {
  $createNodeSelection,
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $setSelection,
  COMMAND_PRIORITY_EDITOR,
  createEditor,
  KEY_ENTER_COMMAND,
  type EditorConfig,
  type LexicalEditor,
  type NodeKey,
} from 'lexical'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import $convertToHtmlString from '@/html/renderer/convert-to-html-string'
import DEFAULT_NODES from '@/nodes/DefaultNodes'
import { $createMathInlineNode, $isMathInlineNode, MathInlineNode } from '@/nodes/math/MathInlineNode'
import {
  dispatchEditMathInlineAtTarget,
  EDIT_MATH_INLINE_COMMAND,
  registerMathInlineEnter,
} from '@/plugins/behaviour/math-inline'
import defaultTheme from '@/themes/default'

describe('MathInlineNode', () => {
  let editor: LexicalEditor

  const editorTest = (testFn: () => Promise<void> | void) => () =>
    new Promise<void>((resolve, reject) => {
      editor.update(() => {
        try {
          const result = testFn()
          Promise.resolve(result).then(resolve).catch(reject)
        } catch (e) {
          reject(e)
        }
      })
    })

  beforeEach(() => {
    editor = createHeadlessEditor({ nodes: [MathInlineNode] })
  })

  it(
    'is an inline decorator matched by $isMathInlineNode',
    editorTest(async () => {
      const node = $createMathInlineNode({ tex: 'x^2' })

      expect(MathInlineNode.getType()).toBe('math-inline')
      expect(node.isInline()).toBe(true)
      expect($isMathInlineNode(node)).toBe(true)
    }),
  )

  it(
    'serializes tex and the artifact slots round-trip',
    editorTest(async () => {
      const node = $createMathInlineNode({ tex: 'x^2', mathml: '<math/>', svg: '<svg/>' })

      const json = node.exportJSON()
      expect(json).toEqual({
        type: 'math-inline',
        version: 1,
        tex: 'x^2',
        mathml: '<math/>',
        svg: '<svg/>',
      })

      const imported = MathInlineNode.importJSON(json as unknown as Record<string, unknown>)
      expect(imported.tex).toBe('x^2')
      expect(imported.mathml).toBe('<math/>')
      expect(imported.svg).toBe('<svg/>')

      const sparse = MathInlineNode.importJSON({ type: 'math-inline', version: 1 })
      expect(sparse.tex).toBe('')
      expect(sparse.mathml).toBe('')
      expect(sparse.svg).toBe('')
    }),
  )

  it(
    'clones with the artifact slots',
    editorTest(async () => {
      const node = $createMathInlineNode({ tex: 'x^2', mathml: '<math/>', svg: '<svg/>' })
      const clone = MathInlineNode.clone(node)

      expect(clone.tex).toBe('x^2')
      expect(clone.mathml).toBe('<math/>')
      expect(clone.svg).toBe('<svg/>')
    }),
  )

  it(
    'clears the artifacts when tex changes but keeps them on construction and same-value reassignment',
    editorTest(async () => {
      const node = $createMathInlineNode({ tex: 'x^2', mathml: '<math/>', svg: '<svg/>' })
      expect(node.svg).toBe('<svg/>')

      node.tex = 'x^2'
      expect(node.svg).toBe('<svg/>')

      node.tex = 'y^2'
      expect(node.tex).toBe('y^2')
      expect(node.mathml).toBe('')
      expect(node.svg).toBe('')
    }),
  )

  describe('createDOM preview', () => {
    it(
      'renders the stored svg artifact, sanitized',
      editorTest(async () => {
        const node = $createMathInlineNode({
          tex: 'x^2',
          svg: '<svg viewBox="0 0 10 10"><path d="M0 0z"/></svg><script>alert(1)</script>',
        })
        const element = node.createDOM({} as EditorConfig)

        expect(element.getAttribute('data-inkling-math-inline')).toBe('true')
        expect(element.innerHTML).toContain('<svg viewBox="0 0 10 10"><path d="M0 0z"></path></svg>')
        expect(element.innerHTML).not.toContain('<script')
      }),
    )

    it(
      'renders the mathml artifact when no svg is present',
      editorTest(async () => {
        const node = $createMathInlineNode({ tex: 'x^2', mathml: '<math><mi>x</mi></math>' })
        const element = node.createDOM({} as EditorConfig)

        expect(element.innerHTML).toBe('<math><mi>x</mi></math>')
      }),
    )

    it(
      'falls back to the tex source when no artifact is stored',
      editorTest(async () => {
        const node = $createMathInlineNode({ tex: 'a < b' })
        const element = node.createDOM({} as EditorConfig)

        expect(element.querySelector('code')?.textContent).toBe('a < b')
      }),
    )

    it(
      'updates when the artifact slots change',
      editorTest(async () => {
        const before = $createMathInlineNode({ tex: 'x^2' })
        const after = $createMathInlineNode({ tex: 'x^2', svg: '<svg/>' })

        expect(after.updateDOM(before)).toBe(true)
        expect(after.updateDOM(after)).toBe(false)
      }),
    )
  })

  describe('exportDOM priority (mirrors kobato pt-html.ts:150-154)', () => {
    it(
      'exports the svg artifact verbatim, sanitized',
      editorTest(async () => {
        const node = $createMathInlineNode({
          tex: 'x^2',
          mathml: '<math><mi>y</mi></math>',
          svg: '<svg viewBox="0 0 10 10"><path d="M0 0z"/></svg>',
        })
        const { element } = node.exportDOM(editor)

        expect((element as HTMLElement).outerHTML).toBe(
          '<span class="inkling-math-inline"><svg viewBox="0 0 10 10"><path d="M0 0z"></path></svg></span>',
        )
      }),
    )

    it(
      'exports the mathml artifact when no svg is present',
      editorTest(async () => {
        const node = $createMathInlineNode({ tex: 'x^2', mathml: '<math><mi>x</mi></math>' })
        const { element } = node.exportDOM(editor)

        expect((element as HTMLElement).outerHTML).toBe(
          '<span class="inkling-math-inline"><math><mi>x</mi></math></span>',
        )
      }),
    )

    it(
      'falls back to <code>tex</code> escaped when no artifact is present',
      editorTest(async () => {
        const node = $createMathInlineNode({ tex: 'a < b' })
        const { element } = node.exportDOM(editor)

        expect((element as HTMLElement).outerHTML).toBe('<code class="inkling-math-inline">a &lt; b</code>')
      }),
    )
  })
})

describe('math inline in the HTML string export', () => {
  // Drives the live export path (HtmlOutputPlugin's own call): the string
  // layer must splice inline decorators into the text flow instead of
  // dropping them.
  function renderState(serializedState: string): string {
    const editor = createEditor({
      namespace: 'test',
      nodes: DEFAULT_NODES,
      theme: defaultTheme,
      onError: (error) => {
        throw error
      },
    })
    editor.setEditorState(editor.parseEditorState(serializedState))

    let html = ''
    editor.read(() => {
      html = $convertToHtmlString(editor)
    })
    return html
  }

  const text = (content: string, format = 0) => ({
    type: 'text',
    version: 1,
    detail: 0,
    format,
    mode: 'normal',
    style: '',
    text: content,
  })

  const paragraph = (children: unknown[]) => ({
    type: 'paragraph',
    version: 1,
    format: '',
    indent: 0,
    direction: 'ltr',
    children,
  })

  const doc = (children: unknown[]) =>
    JSON.stringify({
      root: { children, direction: 'ltr', format: '', indent: 0, type: 'root', version: 1 },
    })

  it('splices the inline math artifact into the surrounding text', () => {
    const state = doc([
      paragraph([
        text('before '),
        {
          type: 'math-inline',
          version: 1,
          tex: 'x^2',
          mathml: '',
          svg: '<svg viewBox="0 0 10 10"><path d="M0 0z"/></svg>',
        },
        text(' after'),
      ]),
    ])

    expect(renderState(state)).toBe(
      '<p>before <span class="inkling-math-inline"><svg viewBox="0 0 10 10"><path d="M0 0z"></path></svg></span> after</p>',
    )
  })

  it('splices the tex fallback between formatted runs', () => {
    const state = doc([
      paragraph([text('bold', 1), { type: 'math-inline', version: 1, tex: 'x^2', mathml: '', svg: '' }, text('plain')]),
    ])

    expect(renderState(state)).toBe('<p><strong>bold</strong><code class="inkling-math-inline">x^2</code>plain</p>')
  })
})

describe('math-inline edit gesture', () => {
  let editor: LexicalEditor

  beforeEach(() => {
    editor = createEditor({
      namespace: 'test',
      nodes: [MathInlineNode],
      onError: (error) => {
        throw error
      },
    })
    const rootElement = document.createElement('div')
    rootElement.setAttribute('contenteditable', 'true')
    document.body.appendChild(rootElement)
    editor.setRootElement(rootElement)
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  function mountMathInline(): Promise<NodeKey> {
    return new Promise((resolve, reject) => {
      editor.update(
        () => {
          try {
            const node = $createMathInlineNode({ tex: 'x^2', svg: '<svg viewBox="0 0 10 10"><path d="M0 0z"/></svg>' })
            const paragraph = $createParagraphNode()
            paragraph.append($createTextNode('before '), node, $createTextNode(' after'))
            $getRoot().append(paragraph)
            resolve(node.getKey())
          } catch (e) {
            reject(e)
          }
        },
        { discrete: true },
      )
    })
  }

  it('dispatches EDIT_MATH_INLINE_COMMAND on double-click inside the preview', async () => {
    const nodeKey = await mountMathInline()
    const listener = vi.fn()
    editor.registerCommand(EDIT_MATH_INLINE_COMMAND, listener, COMMAND_PRIORITY_EDITOR)

    const preview = document.querySelector('[data-inkling-math-inline]')
    expect(preview).not.toBeNull()
    const dispatched = dispatchEditMathInlineAtTarget(editor, preview!.querySelector('svg') ?? preview)

    expect(dispatched).toBe(true)
    expect(listener).toHaveBeenCalledTimes(1)
    expect(listener.mock.calls[0]![0]).toEqual({ nodeKey })
  })

  it('ignores double-clicks outside a math inline preview', async () => {
    await mountMathInline()
    const listener = vi.fn()
    editor.registerCommand(EDIT_MATH_INLINE_COMMAND, listener, COMMAND_PRIORITY_EDITOR)

    expect(dispatchEditMathInlineAtTarget(editor, document.createElement('div'))).toBe(false)
    expect(dispatchEditMathInlineAtTarget(editor, null)).toBe(false)
    expect(listener).not.toHaveBeenCalled()
  })

  it('dispatches EDIT_MATH_INLINE_COMMAND on Enter with the node selected', async () => {
    const nodeKey = await mountMathInline()
    const listener = vi.fn((_payload: { nodeKey: NodeKey }) => true)
    editor.registerCommand(EDIT_MATH_INLINE_COMMAND, listener, COMMAND_PRIORITY_EDITOR)
    const removeEnter = registerMathInlineEnter(editor)

    editor.update(() => {
      const selection = $createNodeSelection()
      selection.add(nodeKey)
      $setSelection(selection)
    })
    editor.dispatchCommand(KEY_ENTER_COMMAND, null)

    expect(listener).toHaveBeenCalledTimes(1)
    expect(listener.mock.calls[0]![0]).toEqual({ nodeKey })
    removeEnter()
  })

  it('leaves Enter alone for range selections', async () => {
    await mountMathInline()
    const listener = vi.fn(() => true)
    editor.registerCommand(EDIT_MATH_INLINE_COMMAND, listener, COMMAND_PRIORITY_EDITOR)
    registerMathInlineEnter(editor)

    editor.update(() => {
      $getRoot().selectStart()
    })
    editor.dispatchCommand(KEY_ENTER_COMMAND, null)

    expect(listener).not.toHaveBeenCalled()
  })
})
