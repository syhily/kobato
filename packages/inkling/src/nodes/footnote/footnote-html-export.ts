// The footnote subsystem's HTML post-processor: wraps the doc-end definition
// run's `<li>` outputs in the footnotes `<section>` (kobato's
// `footnotes-section-title` contract) and claims the run so the string
// layer's trailing-blank-paragraph suppression walks past it. The behaviour
// module's run transform keeps every definition card one contiguous
// doc-end run while editing, so the wrap here is a mechanical splice of the
// run's outputs. Registered in `@/html/renderer/post-process`.

import type { HtmlPostProcessor } from '@/html/renderer/post-process'

import { $isFootnoteDefinitionNode } from '@/nodes/base/nodes/footnotedefinition/FootnoteDefinitionNode'
import { FOOTNOTES_SECTION_HEADING_ID } from '@/nodes/footnote/footnote-anchors'

const DEFAULT_FOOTNOTES_SECTION_TITLE = 'Footnotes'

export const footnotesSectionPostProcessor: HtmlPostProcessor = {
  isTrailingRunNode: (node) => $isFootnoteDefinitionNode(node),

  process({ children, output, context }) {
    let firstDefinitionIndex = children.length
    while (firstDefinitionIndex > 0 && $isFootnoteDefinitionNode(children[firstDefinitionIndex - 1])) {
      firstDefinitionIndex -= 1
    }
    if (firstDefinitionIndex === children.length) {
      return
    }

    const definitionCount = children.length - firstDefinitionIndex
    const items = output.splice(output.length - definitionCount, definitionCount)
    // the heading text resolves through the keyed policy seam (the
    // deprecated `footnotesSectionTitle` flat key forwards there)
    const configuredTitle = context.resolveExportPolicy('footnotes-section-title')?.trim()
    const title = context.escapeText(configuredTitle || DEFAULT_FOOTNOTES_SECTION_TITLE)
    output.push(
      `<section class="footnotes" data-footnotes="" aria-labelledby="${FOOTNOTES_SECTION_HEADING_ID}">` +
        `<h3 id="${FOOTNOTES_SECTION_HEADING_ID}">${title}</h3>` +
        `<ol>${items.join('')}</ol></section>`,
    )
  },
}
