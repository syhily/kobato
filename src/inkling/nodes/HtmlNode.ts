import type { HtmlNodeDataset } from '@/inkling/nodes/cards/card-commands'

import { assembleCardNodeOnce } from '@/inkling/nodes/assemble-card-node'
import { htmlDeclaration } from '@/inkling/nodes/cards/html.declaration'
export { $isHtmlNode } from '@/inkling/nodes/base/nodes/html/HtmlNode'
export type { SerializedHtmlNode } from '@/inkling/nodes/base/nodes/html/HtmlNode'
export { INSERT_HTML_COMMAND } from '@/inkling/nodes/cards/card-commands'
export type { HtmlNodeDataset } from '@/inkling/nodes/cards/card-commands'

/**
 * The registered class, assembled once from the card declaration by
 * `assembleCardNodeOnce`; `$isHtmlNode` is canonical on the base node.
 */
export const HtmlNode = assembleCardNodeOnce(htmlDeclaration)
export type HtmlNode = InstanceType<typeof HtmlNode>

export const $createHtmlNode = (dataset: HtmlNodeDataset) => {
  return new HtmlNode(dataset)
}
