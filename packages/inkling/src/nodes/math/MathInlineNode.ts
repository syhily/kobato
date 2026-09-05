import type { DOMExportOutput, EditorConfig, LexicalEditor, SerializedLexicalNode } from 'lexical'

import DOMPurify from 'dompurify'
import { DecoratorNode } from 'lexical'

import type { ExportDOMOptions } from '@/nodes/base/export-dom'

import { applyArtifactSlotInvalidation } from '@/nodes/base/generate-decorator-node'
import { resolveMathArtifact } from '@/nodes/base/nodes/math/math-artifacts'
import { createRenderContext, MATH_HTML_CONFIG } from '@/nodes/base/render-context'

export interface MathInlineDataset {
  tex?: string
  mathml?: string
  svg?: string
}

export interface SerializedMathInlineNode extends SerializedLexicalNode {
  tex: string
  mathml: string
  svg: string
}

/**
 * Inline math (CONTEXT.md: cards are block-level, so this cannot join the
 * card pipeline): one hand-written inline decorator carrying the TeX source
 * plus the host's server-prerendered artifacts (`mathml`/`svg` slots, default
 * ''). Not a mark/format — Lexical formats are bit flags and cannot carry the
 * `tex` payload; an inline node is the markDef's only tree-side counterpart.
 *
 * The editor preview renders the stored artifacts straight from createDOM
 * (CSP-safe: no wasm, no render runtime in the browser); the host owns the
 * editing UI — inkling only dispatches `EDIT_MATH_INLINE_COMMAND`
 * (`@/plugins/behaviour/math-inline`).
 */
export class MathInlineNode extends DecoratorNode<null> {
  __tex: string
  __mathml: string
  __svg: string

  static getType() {
    return 'math-inline'
  }

  static clone(node: MathInlineNode) {
    return new MathInlineNode({ tex: node.__tex, mathml: node.__mathml, svg: node.__svg }, node.__key)
  }

  static importJSON(serializedNode: Record<string, unknown>) {
    // Trust boundary: same model as the generated nodes' importJSON — payload
    // fields are read at face value, with absent slots defaulting to empty.
    const { tex, mathml, svg } = serializedNode
    return $createMathInlineNode({
      tex: typeof tex === 'string' ? tex : '',
      mathml: typeof mathml === 'string' ? mathml : '',
      svg: typeof svg === 'string' ? svg : '',
    })
  }

  constructor(dataset: MathInlineDataset = {}, key?: string) {
    super(key)
    this.__tex = dataset.tex ?? ''
    this.__mathml = dataset.mathml ?? ''
    this.__svg = dataset.svg ?? ''
  }

  get tex(): string {
    return this.getLatest().__tex
  }

  // The artifact-slot invariant the generated nodes keep as spec data —
  // this hand-written node shares the one implementation:
  // construction/importJSON assign the private fields directly, so
  // host-filled slots survive; only edits clear them.
  set tex(value: string) {
    const writable = this.getWritable()
    applyArtifactSlotInvalidation(writable.__tex !== value, writable, ['__mathml', '__svg'])
    writable.__tex = value
  }

  get mathml(): string {
    return this.getLatest().__mathml
  }

  set mathml(value: string) {
    this.getWritable().__mathml = value
  }

  get svg(): string {
    return this.getLatest().__svg
  }

  set svg(value: string) {
    this.getWritable().__svg = value
  }

  exportJSON(): SerializedMathInlineNode {
    return {
      ...super.exportJSON(),
      type: 'math-inline',
      version: 1,
      tex: this.__tex,
      mathml: this.__mathml,
      svg: this.__svg,
    }
  }

  createDOM(_config: EditorConfig) {
    const span = document.createElement('span')
    span.className = 'inkling-math-inline'
    span.setAttribute('data-inkling-math-inline', 'true')

    const artifact = resolveMathArtifact({ tex: this.__tex, mathml: this.__mathml, svg: this.__svg })
    if (artifact) {
      span.innerHTML = DOMPurify.sanitize(artifact.html, MATH_HTML_CONFIG)
    } else {
      const code = document.createElement('code')
      code.textContent = this.__tex
      span.appendChild(code)
    }

    return span
  }

  updateDOM(prevNode: MathInlineNode) {
    return prevNode.__tex !== this.__tex || prevNode.__mathml !== this.__mathml || prevNode.__svg !== this.__svg
  }

  decorate() {
    return null
  }

  // Priority svg > mathml > <code>tex</code> (kobato pt-html.ts:150-154,
  // 254-265); the artifacts pass through the render-context sanitize.
  exportDOM(_editor: LexicalEditor, options: ExportDOMOptions = {}): DOMExportOutput {
    const context = createRenderContext(options)
    const document = context.createDocument()

    const artifact = resolveMathArtifact({ tex: this.__tex, mathml: this.__mathml, svg: this.__svg })
    if (artifact) {
      const span = document.createElement('span')
      span.setAttribute('class', 'inkling-math-inline')
      span.innerHTML = context.sanitizeCardHtml(artifact.html, MATH_HTML_CONFIG)
      return { element: span }
    }

    const code = document.createElement('code')
    code.setAttribute('class', 'inkling-math-inline')
    code.appendChild(document.createTextNode(this.__tex))
    return { element: code }
  }

  /* c8 ignore next 3 */
  static importDOM() {
    return null
  }

  isInline() {
    return true
  }

  getTextContent() {
    return ''
  }
}

export function $createMathInlineNode(dataset: MathInlineDataset = {}): MathInlineNode {
  return new MathInlineNode(dataset)
}

export function $isMathInlineNode(node: unknown): node is MathInlineNode {
  return node instanceof MathInlineNode
}
