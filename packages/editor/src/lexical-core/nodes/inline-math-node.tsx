import type {
  DOMConversionMap,
  DOMExportOutput,
  EditorConfig,
  LexicalEditor,
  LexicalNode,
  NodeKey,
  SerializedLexicalNode,
  Spread,
} from 'lexical'
import type { ReactNode } from 'react'

import { sanitizeHtml } from '@kobato/editor/engine/lib/sanitize-html'
import { InlineMathView } from '@kobato/editor/lexical-core/nodes/views/inline-math-view'
import { MATH_INLINE_CLASS } from '@kobato/editor/lexical-html/manifest'
import { $applyNodeReplacement, DecoratorNode } from 'lexical'

// Inline math node (PT `mathInline` mark → `{type: 'mathInline', tex,
// mathml?, svg?, ptKey?}`). Serialization (importJSON/exportJSON) is the
// R1 contract; this round adds the DOM trio — `importDOM` (paste from
// both the editor's own `span.math-inline[data-math-inline]` export and
// the historical tiptap `span[data-math-inline]` form), `exportDOM` (the
// manifest `span.math-inline` contract, round-trippable via the `data-*`
// attributes) and `decorate` (click-to-edit React view).

export type SerializedInlineMathNode = Spread<
  SerializedLexicalNode,
  {
    type: 'mathInline'
    tex: string
    mathml?: string
    svg?: string
    /** Originating PT markDef `_key` (migration reconciliation). */
    ptKey?: string
  }
>

export class InlineMathNode extends DecoratorNode<ReactNode> {
  static getType(): string {
    return 'mathInline'
  }

  static clone(node: InlineMathNode): InlineMathNode {
    return new InlineMathNode(node.__tex, node.__mathml, node.__svg, node.__ptKey, node.__key)
  }

  __tex: string
  __mathml: string | undefined
  __svg: string | undefined
  __ptKey: string | undefined

  constructor(tex: string, mathml?: string, svg?: string, ptKey?: string, key?: NodeKey) {
    super(key)
    this.__tex = tex
    this.__mathml = mathml
    this.__svg = svg
    this.__ptKey = ptKey
  }

  static importJSON(serializedNode: SerializedInlineMathNode): InlineMathNode {
    return new InlineMathNode(serializedNode.tex, serializedNode.mathml, serializedNode.svg, serializedNode.ptKey)
  }

  exportJSON(): SerializedInlineMathNode {
    return {
      type: 'mathInline',
      version: 1,
      tex: this.__tex,
      ...(this.__mathml !== undefined ? { mathml: this.__mathml } : {}),
      ...(this.__svg !== undefined ? { svg: this.__svg } : {}),
      ...(this.__ptKey !== undefined ? { ptKey: this.__ptKey } : {}),
    }
  }

  isInline(): boolean {
    return true
  }

  // --- mutation helpers (editor views) ---------------------------------------

  setTex(tex: string): void {
    this.getWritable().__tex = tex
  }

  setMathml(mathml: string | undefined): void {
    this.getWritable().__mathml = mathml
  }

  setSvg(svg: string | undefined): void {
    this.getWritable().__svg = svg
  }

  getTex(): string {
    return this.__tex
  }

  getMathml(): string | undefined {
    return this.__mathml
  }

  getSvg(): string | undefined {
    return this.__svg
  }

  getPtKey(): string | undefined {
    return this.__ptKey
  }

  // --- DOM trio ---------------------------------------------------------------
  //
  // `createDOM` returns the in-editor container element — the React
  // decorate view is portaled INTO it (0.45 decorator rendering), so the
  // container carries only the static manifest attributes. `exportDOM`
  // builds the full markup separately (the portal content is not part of
  // the element at export time).

  createDOM(_config: EditorConfig, _editor: LexicalEditor): HTMLElement {
    const element = document.createElement('span')
    element.setAttribute('data-math-inline', '')
    element.className = MATH_INLINE_CLASS
    return element
  }

  updateDOM(_prevNode: InlineMathNode, _dom: HTMLElement, _config: EditorConfig): boolean {
    return false
  }

  decorate(editor: LexicalEditor): ReactNode {
    return <InlineMathView node={this} editor={editor} />
  }

  static importDOM(): DOMConversionMap | null {
    return {
      span: (element: HTMLElement) => {
        // Both the editor's own export (`span.math-inline[data-math-inline]`)
        // and the historical tiptap form (`span[data-math-inline]`) parse.
        if (element.getAttribute('data-math-inline') === null && !element.classList.contains('math-inline')) {
          return null
        }
        const tex = element.getAttribute('data-tex') ?? element.querySelector('code')?.textContent ?? ''
        const mathml = element.querySelector('math')?.outerHTML
        const svg = element.querySelector('svg')?.outerHTML
        const ptKey = element.getAttribute('data-pt-key') ?? undefined
        return {
          conversion: () => ({ node: $createInlineMathNode(tex, mathml, svg, ptKey) }),
          priority: 1,
        }
      },
    }
  }

  exportDOM(_editor: LexicalEditor): DOMExportOutput {
    const element = document.createElement('span')
    element.setAttribute('data-math-inline', '')
    element.className = MATH_INLINE_CLASS
    element.setAttribute('data-tex', this.__tex)
    if (this.__ptKey !== undefined) {
      element.setAttribute('data-pt-key', this.__ptKey)
    }
    // The manifest markup: MathML (or legacy SVG) first, TeX `<code>` fallback.
    const markup = this.__mathml ?? this.__svg
    if (markup !== undefined && markup !== '') {
      element.innerHTML = sanitizeHtml(markup, 'math')
    } else {
      const code = document.createElement('code')
      code.textContent = this.__tex
      element.append(code)
    }
    return { element }
  }
}

export function $createInlineMathNode(tex: string, mathml?: string, svg?: string, ptKey?: string): InlineMathNode {
  return $applyNodeReplacement(new InlineMathNode(tex, mathml, svg, ptKey))
}

export function $isInlineMathNode(node: LexicalNode | null | undefined): node is InlineMathNode {
  return node instanceof InlineMathNode
}
