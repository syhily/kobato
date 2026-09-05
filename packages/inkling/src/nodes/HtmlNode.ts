import type { HtmlNodeDataset } from '@/nodes/cards/card-commands'

import { assembleCardNodeOnce } from '@/nodes/assemble-card-node'
import { htmlDeclaration } from '@/nodes/cards/html.declaration'
export { $isHtmlNode } from '@/nodes/base/nodes/html/HtmlNode'
export type { SerializedHtmlNode } from '@/nodes/base/nodes/html/HtmlNode'
export { INSERT_HTML_COMMAND } from '@/nodes/cards/card-commands'
export type { HtmlNodeDataset } from '@/nodes/cards/card-commands'

/**
 * Transition shim (plan 039, Batch 5): the hand-written wrapper is gone — the
 * registered class is assembled from the card declaration, and `$isHtmlNode`
 * is canonical on the base node.
 */
export const HtmlNode = assembleCardNodeOnce(htmlDeclaration)
export type HtmlNode = InstanceType<typeof HtmlNode>

export const $createHtmlNode = (dataset: HtmlNodeDataset) => {
  return new HtmlNode(dataset)
}
