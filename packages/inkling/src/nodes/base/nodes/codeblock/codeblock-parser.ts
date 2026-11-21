import type { LexicalNode } from 'lexical'

import { readCaptionFromElement } from '@kobato/inkling-internal/nodes/base/utils/read-caption-from-element'

export function parseCodeBlockNode(BaseCodeBlockNode: new (data: Record<string, unknown>) => LexicalNode) {
  return {
    figure: (nodeElem: HTMLElement) => {
      const pre = nodeElem.querySelector('pre')
      if (pre) {
        return {
          conversion(domNode: HTMLElement) {
            const code = pre.querySelector('code')
            const figcaption = domNode.querySelector('figcaption')

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
            const languageMatches = langRegex.exec(preClass) || langRegex.exec(codeClass)
            if (languageMatches) {
              payload.language = languageMatches[1].toLowerCase()
            }

            const node = new BaseCodeBlockNode(payload)
            return { node }
          },
          priority: 2 as const,
        }
      }
      return null
    },
    pre: () => ({
      conversion(domNode: HTMLElement) {
        const [codeElement] = domNode.children

        if (codeElement?.tagName === 'CODE') {
          const payload: Record<string, unknown> = { code: codeElement.textContent }
          const preClass = domNode.getAttribute('class') || ''
          const codeClass = codeElement.getAttribute('class') || ''
          const langRegex = /lang(?:uage)?-(.*?)(?:\s|$)/i
          const languageMatches = langRegex.exec(preClass) || langRegex.exec(codeClass)
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
