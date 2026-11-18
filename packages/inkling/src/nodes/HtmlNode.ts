import type { HtmlNodeDataset } from '@kobato/inkling-internal/nodes/cards/card-commands'

import { assembleCardNodeOnce } from '@kobato/inkling-internal/nodes/assemble-card-node'
import { htmlDeclaration } from '@kobato/inkling-internal/nodes/cards/html.declaration'
export { $isHtmlNode } from '@kobato/inkling-internal/nodes/base/nodes/html/HtmlNode'
export type { SerializedHtmlNode } from '@kobato/inkling-internal/nodes/base/nodes/html/HtmlNode'
export { INSERT_HTML_COMMAND } from '@kobato/inkling-internal/nodes/cards/card-commands'
export type { HtmlNodeDataset } from '@kobato/inkling-internal/nodes/cards/card-commands'

/**
 * The registered class, assembled once from the card declaration by
 * `assembleCardNodeOnce`; `$isHtmlNode` is canonical on the base node.
 */
export const HtmlNode = assembleCardNodeOnce(htmlDeclaration)
export type HtmlNode = InstanceType<typeof HtmlNode>

export const $createHtmlNode = (dataset: HtmlNodeDataset) => {
  return new HtmlNode(dataset)
}
