import type { LexicalNode } from 'lexical'

import { createFootnoteTargetKey, resolveImportedFootnoteTargetKey } from '@/nodes/footnote/footnote-keys'

// Hand-written import parser (CONTEXT.md: "import spec"; gallery-parser
// precedent — structural parsing stays out of the flat per-property import
// spec). Both footnote HTML dialects arrive as one container:
// `section.footnotes > ol > li` is markdown-it-footnote's paste shape and
// inkling's own export shape alike, so ONE conversion consumes the whole
// section and returns every definition node. The li `id` is only the source
// anchor slug correlating definitions with their refs — targetKeys are
// recast per import (see `@/nodes/footnote/footnote-keys`).
export function parseFootnoteDefinitionSection(
  FootnoteDefinitionNodeClass: new (data: Record<string, unknown>) => LexicalNode,
) {
  return {
    // markdown-it-footnote separates prose from the definitions with
    // <hr class="footnotes-sep"> — swallow it here (priority 1 beats the HR
    // card's 0, and ties go to the later-registered class) so it doesn't
    // import as a horizontal-rule card. Sibling removal at section time
    // would be too late: the hr converts BEFORE the section is reached.
    hr: (nodeElem: HTMLElement) => {
      if (!nodeElem.classList.contains('footnotes-sep')) {
        return null
      }
      return {
        conversion: () => ({ node: null }),
        priority: 1 as const,
      }
    },
    section: (nodeElem: HTMLElement) => {
      if (!nodeElem.classList.contains('footnotes')) {
        return null
      }

      return {
        conversion(domNode: HTMLElement) {
          const nodes: LexicalNode[] = []
          domNode.querySelectorAll(':scope > ol > li').forEach((li) => {
            const slug = li.getAttribute('id')
            const targetKey = slug
              ? resolveImportedFootnoteTargetKey(domNode.ownerDocument, slug)
              : createFootnoteTargetKey()

            // The definition content is the li's inner HTML minus its
            // back-reference anchors (markdown-it's `a.footnote-backref`
            // inside the paragraph, inkling's own trailing
            // `a[data-footnote-backref]`).
            const content = li.cloneNode(true) as HTMLElement
            content
              .querySelectorAll('a[data-footnote-backref], a.footnote-backref')
              .forEach((anchor) => anchor.remove())

            nodes.push(new FootnoteDefinitionNodeClass({ targetKey, content: content.innerHTML.trim() }))
          })

          return { node: nodes.length > 0 ? nodes : null }
        },
        priority: 1 as const,
      }
    },
  }
}
