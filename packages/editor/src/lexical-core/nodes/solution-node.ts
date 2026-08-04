import type {
  DOMConversionMap,
  DOMExportOutput,
  EditorConfig,
  LexicalEditor,
  LexicalNode,
  LexicalUpdateJSON,
  NodeKey,
  SerializedElementNode,
  Spread,
} from 'lexical'

import {
  SOLUTION_BEGIN_CLASS,
  SOLUTION_BEGIN_TEXT,
  SOLUTION_CLASS,
  SOLUTION_QED_CLASS,
  SOLUTION_QED_SVG,
} from '@kobato/editor/lexical-html/manifest'
import { $applyNodeReplacement, ElementNode, isHTMLElement } from 'lexical'

// Solution container node (PT `solution` block → `{type: 'solution',
// ptKey?, children}`). Children are non-container blocks only. The
// editor DOM is the render contract's `<blockquote data-pt-solution>`;
// the export DOM carries the full decoration ("解：" intro + QED marker),
// and import strips the decoration elements so they never become stray
// text nodes. In-editor container interactions (add/remove children)
// land in R3b — this round is structure only.

export type SerializedSolutionNode = Spread<
  SerializedElementNode,
  {
    type: 'solution'
    /** Originating PT block `_key` (migration reconciliation). */
    ptKey?: string
  }
>

export class SolutionNode extends ElementNode {
  static getType(): string {
    return 'solution'
  }

  static clone(node: SolutionNode): SolutionNode {
    return new SolutionNode(node.__ptKey, node.__key)
  }

  __ptKey: string | undefined

  constructor(ptKey?: string, key?: NodeKey) {
    super(key)
    this.__ptKey = ptKey
  }

  static importJSON(serializedNode: SerializedSolutionNode): SolutionNode {
    return $createSolutionNode(serializedNode.ptKey).updateFromJSON(serializedNode)
  }

  updateFromJSON(serializedNode: LexicalUpdateJSON<SerializedSolutionNode>): this {
    return super.updateFromJSON(serializedNode)
  }

  exportJSON(): SerializedSolutionNode {
    return {
      ...super.exportJSON(),
      type: 'solution',
      ...(this.__ptKey !== undefined ? { ptKey: this.__ptKey } : {}),
    }
  }

  getPtKey(): string | undefined {
    return this.__ptKey
  }

  // --- DOM trio (element: createDOM/updateDOM + import/export) ----------------

  createDOM(_config: EditorConfig, _editor: LexicalEditor): HTMLElement {
    const element = document.createElement('blockquote')
    element.setAttribute('data-pt-solution', '')
    element.className = SOLUTION_CLASS
    return element
  }

  updateDOM(_prevNode: SolutionNode, _dom: HTMLElement, _config: EditorConfig): boolean {
    return false
  }

  static importDOM(): DOMConversionMap | null {
    return {
      blockquote: (element: HTMLElement) => {
        if (element.getAttribute('data-pt-solution') === null) {
          return null
        }
        const ptKey = element.getAttribute('data-pt-key') ?? undefined
        return {
          conversion: () => {
            // Strip the render decorations ("解：" intro + QED marker) so
            // their text/svg descendants cannot leak into the children.
            element
              .querySelectorAll('[data-pt-solution-begin], [data-pt-solution-qed]')
              .forEach((decor) => decor.remove())
            return { node: $createSolutionNode(ptKey) }
          },
          priority: 1,
        }
      },
    }
  }

  exportDOM(_editor: LexicalEditor): DOMExportOutput {
    // `super.exportDOM` runs `createDOM` (the blockquote container);
    // children are appended by the renderer, then `after` decorates.
    const { element } = super.exportDOM(_editor)
    if (!isHTMLElement(element)) {
      return { element }
    }
    if (this.__ptKey !== undefined) {
      element.setAttribute('data-pt-key', this.__ptKey)
    }
    return {
      element,
      after(generatedElement) {
        // NOTE: must return `null` — returning the element itself makes
        // the renderer `element.replaceWith(newElement)` the node with
        // itself, which removes it from the output tree in some DOM
        // implementations (happy-dom). The decorations are in-place edits.
        if (generatedElement === null || generatedElement === undefined || !('prepend' in generatedElement)) {
          return null
        }
        const intro = document.createElement('div')
        intro.setAttribute('data-pt-solution-begin', '')
        intro.className = SOLUTION_BEGIN_CLASS
        intro.textContent = SOLUTION_BEGIN_TEXT
        const qed = document.createElement('span')
        qed.setAttribute('data-pt-solution-qed', '')
        qed.className = SOLUTION_QED_CLASS
        qed.setAttribute('aria-hidden', 'true')
        qed.innerHTML = SOLUTION_QED_SVG
        generatedElement.prepend(intro)
        generatedElement.append(qed)
        return null
      },
    }
  }
}

export function $createSolutionNode(ptKey?: string): SolutionNode {
  return $applyNodeReplacement(new SolutionNode(ptKey))
}

export function $isSolutionNode(node: LexicalNode | null | undefined): node is SolutionNode {
  return node instanceof SolutionNode
}
