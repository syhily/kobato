import type { LexicalEditor } from 'lexical'

/* c8 ignore start */
import { DecoratorNode } from 'lexical'

import type { ExportDOMOptions, ExportDOMOutput } from '@/ui/inkling-editor/nodes/base/export-dom'

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
  hasDynamicData(): boolean
  hasEditMode(): boolean
  isEmpty(): boolean
  getDynamicData?(options: ExportDOMOptions): Promise<{ key: number; data: unknown }>
}

export function $isInklingCard(node: unknown): node is InklingCard {
  if (!(node instanceof InklingDecoratorNode)) {
    return false
  }

  const card = node as Partial<InklingCard>

  return (
    typeof card.isInklingCard === 'function' &&
    card.isInklingCard() === true &&
    typeof card.exportDOM === 'function' &&
    typeof card.hasDynamicData === 'function'
  )
}
/* c8 ignore end */
