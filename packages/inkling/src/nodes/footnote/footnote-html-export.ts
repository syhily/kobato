import type { HtmlPostProcessor } from '@kobato/inkling-internal/html/renderer/post-process'

import { $isFootnoteDefinitionNode } from '@kobato/inkling-internal/nodes/base/nodes/footnotedefinition/FootnoteDefinitionNode'
import { FOOTNOTES_SECTION_HEADING_ID } from '@kobato/inkling-internal/nodes/footnote/footnote-anchors'
const DEFAULT_FOOTNOTES_SECTION_TITLE = 'Footnotes'
export const footnotesSectionPostProcessor: HtmlPostProcessor = {
  isTrailingRunNode: (node) => $isFootnoteDefinitionNode(node),

  process({ children, output, outputIndexByChild, context }) {
    let firstDefinitionIndex = children.length
    while (firstDefinitionIndex > 0 && $isFootnoteDefinitionNode(children[firstDefinitionIndex - 1])) {
      firstDefinitionIndex -= 1
    }
    if (firstDefinitionIndex === children.length) {
      return
    }

    const firstOutputIndex = outputIndexByChild[firstDefinitionIndex]
    if (firstOutputIndex < 0) {
      return
    }
    const items = output.splice(firstOutputIndex)

    const configuredTitle = context.resolveExportPolicy('footnotes-section-title')?.trim()
    const title = context.escapeText(configuredTitle || DEFAULT_FOOTNOTES_SECTION_TITLE)
    output.push(
      `<section class="footnotes" data-footnotes="" aria-labelledby="${FOOTNOTES_SECTION_HEADING_ID}">` +
        `<h3 id="${FOOTNOTES_SECTION_HEADING_ID}">${title}</h3>` +
        `<ol>${items.join('')}</ol></section>`,
    )
  },
}
