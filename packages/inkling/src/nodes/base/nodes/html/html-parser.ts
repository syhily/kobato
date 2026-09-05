// Survives hand-written (no import spec, CONTEXT.md: "import spec"): a
// comment-delimited sibling walker that removes nodes as it goes is
// structural, not flat per-property reads.
import type { LexicalNode } from 'lexical'

export function parseHtmlNode(BaseHtmlNode: new (data: Record<string, unknown>) => LexicalNode) {
  return {
    '#comment': (nodeElem: Node) => {
      if (nodeElem.nodeType === 8 && nodeElem.nodeValue?.trim().match(/^inkling-card-begin:\s?html$/)) {
        return {
          conversion(domNode: Node) {
            const html: string[] = []
            let nextNode = domNode.nextSibling
            let hasEndComment = false

            while (nextNode) {
              if (isHtmlEndComment(nextNode)) {
                hasEndComment = true
                break
              }

              nextNode = nextNode.nextSibling
            }

            nextNode = domNode.nextSibling

            if (hasEndComment) {
              while (nextNode && !isHtmlEndComment(nextNode)) {
                const currentNode = nextNode
                nextNode = currentNode.nextSibling
                // nodeType, not instanceof: the source document may be
                // another jsdom realm's, where instanceof fails
                if (currentNode.nodeType === 1) {
                  html.push((currentNode as Element).outerHTML)
                } else if (currentNode.nodeType === 3 && currentNode.textContent) {
                  html.push(currentNode.textContent)
                }
                // remove nodes as we go so that they don't go through the parser
                currentNode.remove()
              }

              if (nextNode && isHtmlEndComment(nextNode)) {
                nextNode.remove()
              }
            }

            const payload: Record<string, unknown> = { html: html.join('\n').trim() }
            const node = new BaseHtmlNode(payload)
            return { node }
          },
          priority: 0 as const,
        }
      }

      return null
    },
    table: (nodeElem: HTMLElement) => {
      if (nodeElem.nodeType === 1 && nodeElem.tagName === 'TABLE' && nodeElem.parentElement?.tagName !== 'TABLE') {
        return {
          conversion(domNode: HTMLElement) {
            const payload: Record<string, unknown> = { html: domNode.outerHTML }
            const node = new BaseHtmlNode(payload)
            return { node }
          },
          priority: 0 as const,
        }
      }

      return null
    },
  }
}

function isHtmlEndComment(node: Node) {
  return node.nodeType === 8 && node.nodeValue?.trim().match(/^inkling-card-end:\s?html$/)
}
