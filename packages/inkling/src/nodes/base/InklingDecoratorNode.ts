import type { ExportDOMOptions, ExportDOMOutput } from '@kobato/inkling-internal/nodes/base/export-dom'
import type { LexicalEditor } from 'lexical'

/* c8 ignore start */
import { DecoratorNode } from 'lexical'

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
  getDataset(): Record<string, unknown>
  isEmpty?(): boolean
}

export function $isInklingCard(node: unknown): node is InklingCard {
  if (!(node instanceof InklingDecoratorNode)) {
    return false
  }

  const card: {
    decorate: InklingDecoratorNode['decorate']
    isInklingCard?: (() => unknown) | undefined
    exportDOM?: unknown
    hasEditMode?: unknown
    getDataset?: unknown
  } = node

  return (
    typeof card.isInklingCard === 'function' &&
    card.isInklingCard() === true &&
    typeof card.exportDOM === 'function' &&
    typeof card.hasEditMode === 'function' &&
    typeof card.getDataset === 'function'
  )
}
/* c8 ignore end */
