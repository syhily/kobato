import type { LexicalNode } from 'lexical'

import {
  createFootnoteTargetKey,
  resolveImportedFootnoteTargetKey,
} from '@kobato/inkling-internal/nodes/footnote/footnote-keys'

export function parseFootnoteDefinitionSection(
  FootnoteDefinitionNodeClass: new (data: Record<string, unknown>) => LexicalNode,
) {
  return {
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

            const content = li.cloneNode(true)
            if (!isElementNode(content)) {
              return
            }
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

function isElementNode(node: Node): node is Element {
  return node.nodeType === 1
}
