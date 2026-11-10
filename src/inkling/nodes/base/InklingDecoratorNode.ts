import type { LexicalEditor } from 'lexical'

/* c8 ignore start */
import { DecoratorNode } from 'lexical'

import type { ExportDOMOptions, ExportDOMOutput } from '@/inkling/nodes/base/export-dom'

export class InklingDecoratorNode extends DecoratorNode<unknown> {
  static transform() {
    return null
  }

  decorate(): unknown {
    return null
  }
}

export type InklingCard = InklingDecoratorNode & {
  isInklingCard(): true
  exportDOM(editor: LexicalEditor, options?: ExportDOMOptions): ExportDOMOutput
  hasEditMode(): boolean
  // defined by generateDecoratorNode on every card class
  getDataset(): Record<string, unknown>
  // optional: generated card classes do not define isEmpty
  isEmpty?(): boolean
}

export function $isInklingCard(node: unknown): node is InklingCard {
  if (!(node instanceof InklingDecoratorNode)) {
    return false
  }

  // Structural binding, not an assertion: every probed member is optional
  // unknown, and `decorate` keeps the weak-type check satisfied
  // (Partial<InklingCard> fails — DecoratorNode's exportDOM returns lexical's
  // ExportDOMOutput, not inkling's).
  const card: {
    decorate: InklingDecoratorNode['decorate']
    isInklingCard?: (() => unknown) | undefined
    exportDOM?: unknown
    hasEditMode?: unknown
    getDataset?: unknown
  } = node

  // hasEditMode/getDataset are part of the asserted InklingCard interface too
  // (registerCardCommands/enter/card-interaction call hasEditMode() directly),
  // so a node passing only the isInklingCard+exportDOM pair would crash there
  return (
    typeof card.isInklingCard === 'function' &&
    card.isInklingCard() === true &&
    typeof card.exportDOM === 'function' &&
    typeof card.hasEditMode === 'function' &&
    typeof card.getDataset === 'function'
  )
}
/* c8 ignore end */
