// Survives hand-written (no import spec, CONTEXT.md: "import spec"): the
// conversion-abort guards on child presence and the first-child-must-be-CODE
// check are structural, not flat per-property reads.
import type { LexicalNode } from 'lexical'

import { readCaptionFromElement } from '@/nodes/base/utils/read-caption-from-element'

export function parseCodeBlockNode(BaseCodeBlockNode: new (data: Record<string, unknown>) => LexicalNode) {
  return {
    figure: (nodeElem: HTMLElement) => {
      // tagName is guaranteed by Lexical's nodeName dispatch ('figure' key)
      const pre = nodeElem.querySelector('pre')
      if (pre) {
        return {
          conversion(domNode: HTMLElement) {
            const code = pre.querySelector('code')
            const figcaption = domNode.querySelector('figcaption')

            // if there's no caption the pre key should pick it up
            if (!code || !figcaption) {
              return null
            }

            const payload: Record<string, unknown> = {
              code: code.textContent,
              caption: readCaptionFromElement(domNode),
            }

            const preClass = pre.getAttribute('class') || ''
            const codeClass = code.getAttribute('class') || ''
            const langRegex = /lang(?:uage)?-(.*?)(?:\s|$)/i
            const languageMatches = preClass.match(langRegex) || codeClass.match(langRegex)
            if (languageMatches) {
              payload.language = languageMatches[1].toLowerCase()
            }

            const node = new BaseCodeBlockNode(payload)
            return { node }
          },
          priority: 2 as const, // falls back to pre if no caption
        }
      }
      return null
    },
    pre: () => ({
      // tagName is guaranteed by Lexical's nodeName dispatch ('pre' key)
      conversion(domNode: HTMLElement) {
        const [codeElement] = domNode.children

        if (codeElement && codeElement.tagName === 'CODE') {
          const payload: Record<string, unknown> = { code: codeElement.textContent }
          const preClass = domNode.getAttribute('class') || ''
          const codeClass = codeElement.getAttribute('class') || ''
          const langRegex = /lang(?:uage)?-(.*?)(?:\s|$)/i
          const languageMatches = preClass.match(langRegex) || codeClass.match(langRegex)
          if (languageMatches) {
            payload.language = languageMatches[1].toLowerCase()
          }
          const node = new BaseCodeBlockNode(payload)
          return { node }
        }

        return null
      },
      priority: 1 as const,
    }),
  }
}
