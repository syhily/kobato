import type { HtmlNodeDataset } from './cards/card-commands'

import { assembleCardNodeOnce } from './assemble-card-node'
import { htmlDeclaration } from './cards/html.declaration'
export { $isHtmlNode } from './base/nodes/html/HtmlNode'
export type { SerializedHtmlNode } from './base/nodes/html/HtmlNode'
export { INSERT_HTML_COMMAND } from './cards/card-commands'
export type { HtmlNodeDataset } from './cards/card-commands'

/**
 * The registered class, assembled once from the card declaration by
 * `assembleCardNodeOnce`; `$isHtmlNode` is canonical on the base node.
 */
export const HtmlNode = assembleCardNodeOnce(htmlDeclaration)
export type HtmlNode = InstanceType<typeof HtmlNode>

export const $createHtmlNode = (dataset: HtmlNodeDataset) => {
  return new HtmlNode(dataset)
}
