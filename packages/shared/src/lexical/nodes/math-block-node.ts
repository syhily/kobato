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

import { MATH_DISPLAY_CLASS } from '@kobato/shared/lexical/html-manifest'
import { sanitizeMathMarkup } from '@kobato/shared/lexical/math-sanitize'
import { renderNodeView } from '@kobato/shared/lexical/node-views'
import { $applyNodeReplacement, DecoratorNode } from 'lexical'

// Block math node (PT `mathBlock` block → `{type: 'mathBlock', tex,
// mathml?, svg?, ptKey?}`). Serialization is the R1 contract; this round
// adds the DOM trio — `importDOM`/`exportDOM` on the manifest
// `div.math math-display` form (round-trippable via `data-*`) and
// `decorate` (the block-card TeX editor reusing `MathBlockSourceEditor`,
// registered by the editor engine through the shared node-view registry —
// this node class itself carries no React import).

export type SerializedMathBlockNode = Spread<
  SerializedLexicalNode,
  {
    type: 'mathBlock'
    tex: string
    mathml?: string
    svg?: string
    /** Originating PT block `_key` (migration reconciliation). */
    ptKey?: string
  }
>

export class MathBlockNode extends DecoratorNode<unknown> {
  static getType(): string {
    return 'mathBlock'
  }

  static clone(node: MathBlockNode): MathBlockNode {
    return new MathBlockNode(node.__tex, node.__mathml, node.__svg, node.__ptKey, node.__key)
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

  static importJSON(serializedNode: SerializedMathBlockNode): MathBlockNode {
    return new MathBlockNode(serializedNode.tex, serializedNode.mathml, serializedNode.svg, serializedNode.ptKey)
  }

  exportJSON(): SerializedMathBlockNode {
    return {
      type: 'mathBlock',
      version: 1,
      tex: this.__tex,
      ...(this.__mathml !== undefined ? { mathml: this.__mathml } : {}),
      ...(this.__svg !== undefined ? { svg: this.__svg } : {}),
      ...(this.__ptKey !== undefined ? { ptKey: this.__ptKey } : {}),
    }
  }

  isInline(): boolean {
    return false
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
  // `createDOM` returns the in-editor container (the React view is
  // portaled into it); the export form is built separately in
  // `exportDOM` with the manifest display markup.

  createDOM(_config: EditorConfig, _editor: LexicalEditor): HTMLElement {
    return document.createElement('div')
  }

  updateDOM(_prevNode: MathBlockNode, _dom: HTMLElement, _config: EditorConfig): boolean {
    return false
  }

  decorate(editor: LexicalEditor): unknown {
    return renderNodeView(MathBlockNode, this, editor)
  }

  static importDOM(): DOMConversionMap | null {
    return {
      div: (element: HTMLElement) => {
        if (element.getAttribute('data-pt-math-block') === null) {
          return null
        }
        const tex = element.getAttribute('data-tex') ?? element.querySelector('code')?.textContent ?? ''
        const mathml = element.querySelector('math')?.outerHTML
        const svg = element.querySelector('svg')?.outerHTML
        const ptKey = element.getAttribute('data-pt-key') ?? undefined
        return {
          conversion: () => ({ node: $createMathBlockNode(tex, mathml, svg, ptKey) }),
          priority: 1,
        }
      },
    }
  }

  exportDOM(_editor: LexicalEditor): DOMExportOutput {
    const element = document.createElement('div')
    element.setAttribute('data-pt-math-block', '')
    element.className = MATH_DISPLAY_CLASS
    element.setAttribute('data-tex', this.__tex)
    if (this.__ptKey !== undefined) {
      element.setAttribute('data-pt-key', this.__ptKey)
    }
    // The manifest markup: MathML (or legacy SVG) first, TeX `<code>` fallback.
    const markup = this.__mathml ?? this.__svg
    if (markup !== undefined && markup !== '') {
      element.innerHTML = sanitizeMathMarkup(markup)
    } else {
      const pre = document.createElement('pre')
      const code = document.createElement('code')
      code.textContent = this.__tex
      pre.append(code)
      element.append(pre)
    }
    return { element }
  }
}

export function $createMathBlockNode(tex: string, mathml?: string, svg?: string, ptKey?: string): MathBlockNode {
  return $applyNodeReplacement(new MathBlockNode(tex, mathml, svg, ptKey))
}

export function $isMathBlockNode(node: LexicalNode | null | undefined): node is MathBlockNode {
  return node instanceof MathBlockNode
}
