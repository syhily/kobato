import type { DOMConversionMap, DOMExportOutput, EditorConfig, LexicalEditor, NodeKey } from 'lexical'
import type { JSX } from 'react'

import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { DecoratorNode } from 'lexical'

import type { InklingNonRecursiveBlockNode, InklingSolutionNode, InklingTwoColumnNode } from '@/shared/inkling/schema'

import { NestedInklingEditor } from '@/ui/inkling/editor/nested/NestedEditor'

/* ── Solution & TwoColumn (skeleton — nested editors wired in P4) ── */
export class SolutionCardNode extends DecoratorNode<JSX.Element | null> {
  __children: InklingNonRecursiveBlockNode[]

  static getType(): string {
    return 'solution'
  }

  static clone(node: SolutionCardNode): SolutionCardNode {
    return new SolutionCardNode(node.__children, node.__key)
  }

  constructor(children: InklingNonRecursiveBlockNode[], key?: NodeKey) {
    super(key)
    this.__children = children
  }

  getChildren(): InklingNonRecursiveBlockNode[] {
    return this.__children
  }
  setChildren(children: InklingNonRecursiveBlockNode[]): void {
    this.getWritable().__children = children
  }

  createDOM(_config: EditorConfig): HTMLElement {
    const el = document.createElement('div')
    el.setAttribute('data-inkling-solution', 'true')
    return el
  }
  updateDOM(): false {
    return false
  }
  // See ImageCardNode.isKeyboardSelectable (simple-card-nodes.tsx).
  isKeyboardSelectable(): boolean {
    return true
  }

  decorate(_editor: LexicalEditor, _config: EditorConfig): JSX.Element {
    return <SolutionCardComponent node={this} />
  }
  isInline(): boolean {
    return false
  }

  exportJSON(): InklingSolutionNode {
    return { ...super.exportJSON(), type: 'solution', version: 1, children: this.__children }
  }

  static importJSON(serializedNode: InklingSolutionNode): SolutionCardNode {
    return new SolutionCardNode(serializedNode.children)
  }

  static importDOM(): DOMConversionMap | null {
    return {
      div: (node: Node) => {
        if (node instanceof HTMLElement && node.dataset?.inklingSolution === 'true') {
          return { conversion: () => ({ node: new SolutionCardNode([]) }), priority: 1 }
        }
        return null
      },
    }
  }

  exportDOM(): DOMExportOutput {
    const el = document.createElement('div')
    el.setAttribute('data-inkling-solution', 'true')
    return { element: el }
  }
}

export function $createSolutionCardNode(payload: Omit<InklingSolutionNode, 'type' | 'version'>): SolutionCardNode {
  return new SolutionCardNode(payload.children)
}

export function $isSolutionCardNode(node: unknown): node is SolutionCardNode {
  return node instanceof SolutionCardNode
}

export class TwoColumnCardNode extends DecoratorNode<JSX.Element | null> {
  __left: InklingNonRecursiveBlockNode[]
  __right: InklingNonRecursiveBlockNode[]

  static getType(): string {
    return 'two-column'
  }

  static clone(node: TwoColumnCardNode): TwoColumnCardNode {
    return new TwoColumnCardNode(node.__left, node.__right, node.__key)
  }

  constructor(left: InklingNonRecursiveBlockNode[], right: InklingNonRecursiveBlockNode[], key?: NodeKey) {
    super(key)
    this.__left = left
    this.__right = right
  }

  getLeft(): InklingNonRecursiveBlockNode[] {
    return this.__left
  }
  setLeft(left: InklingNonRecursiveBlockNode[]): void {
    this.getWritable().__left = left
  }
  getRight(): InklingNonRecursiveBlockNode[] {
    return this.__right
  }
  setRight(right: InklingNonRecursiveBlockNode[]): void {
    this.getWritable().__right = right
  }

  createDOM(_config: EditorConfig): HTMLElement {
    const el = document.createElement('section')
    el.setAttribute('data-inkling-two-column', 'true')
    return el
  }
  updateDOM(): false {
    return false
  }
  // See ImageCardNode.isKeyboardSelectable (simple-card-nodes.tsx).
  isKeyboardSelectable(): boolean {
    return true
  }

  decorate(_editor: LexicalEditor, _config: EditorConfig): JSX.Element {
    return <TwoColumnCardComponent node={this} />
  }
  isInline(): boolean {
    return false
  }

  exportJSON(): InklingTwoColumnNode {
    return { ...super.exportJSON(), type: 'two-column', version: 1, left: this.__left, right: this.__right }
  }

  static importJSON(serializedNode: InklingTwoColumnNode): TwoColumnCardNode {
    return new TwoColumnCardNode(serializedNode.left, serializedNode.right)
  }

  static importDOM(): DOMConversionMap | null {
    return {
      section: (node: Node) => {
        if (node instanceof HTMLElement && node.dataset?.inklingTwoColumn === 'true') {
          return { conversion: () => ({ node: new TwoColumnCardNode([], []) }), priority: 1 }
        }
        return null
      },
    }
  }

  exportDOM(): DOMExportOutput {
    const el = document.createElement('section')
    el.setAttribute('data-inkling-two-column', 'true')
    return { element: el }
  }
}

export function $createTwoColumnCardNode(payload: Omit<InklingTwoColumnNode, 'type' | 'version'>): TwoColumnCardNode {
  return new TwoColumnCardNode(payload.left, payload.right)
}

export function $isTwoColumnCardNode(node: unknown): node is TwoColumnCardNode {
  return node instanceof TwoColumnCardNode
}

function SolutionCardComponent({ node }: { node: SolutionCardNode }): JSX.Element {
  const [editor] = useLexicalComposerContext()
  return (
    <NestedInklingEditor
      initialBlocks={node.getChildren()}
      onChange={(blocks) => {
        editor.update(() => {
          node.setChildren(blocks)
        })
      }}
      className="inkling-solution-editor rounded border bg-muted/20 p-3"
    />
  )
}

function TwoColumnCardComponent({ node }: { node: TwoColumnCardNode }): JSX.Element {
  const [editor] = useLexicalComposerContext()
  return (
    <div className="inkling-two-column grid grid-cols-1 gap-4 md:grid-cols-2">
      <NestedInklingEditor
        initialBlocks={node.getLeft()}
        onChange={(blocks) => {
          editor.update(() => {
            node.setLeft(blocks)
          })
        }}
        className="inkling-two-column-left rounded border bg-muted/20 p-3"
      />
      <NestedInklingEditor
        initialBlocks={node.getRight()}
        onChange={(blocks) => {
          editor.update(() => {
            node.setRight(blocks)
          })
        }}
        className="inkling-two-column-right rounded border bg-muted/20 p-3"
      />
    </div>
  )
}
