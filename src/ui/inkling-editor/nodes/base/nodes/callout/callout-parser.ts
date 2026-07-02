import type { LexicalNode } from 'lexical'
const getColorTag = (nodeElem: HTMLElement) => {
  const colorClass = nodeElem.classList?.value?.match(/inkling-callout-card-(\w+)/)
  return colorClass && colorClass[1]
}

export function parseCalloutNode(CalloutNode: new (data: Record<string, unknown>) => LexicalNode) {
  return {
    div: (nodeElem: HTMLElement) => {
      const isKgCalloutCard = nodeElem.classList?.contains('inkling-callout-card')
      if (nodeElem.tagName === 'DIV' && isKgCalloutCard) {
        return {
          conversion(domNode: HTMLElement) {
            const textNode = domNode?.querySelector('.inkling-callout-text')
            const emojiNode = domNode?.querySelector('.inkling-callout-emoji')
            const color = getColorTag(domNode)

            const payload: Record<string, unknown> = {
              calloutText: (textNode && textNode.innerHTML.trim()) || '',
              calloutEmoji: (emojiNode && emojiNode.innerHTML.trim()) || '',
              backgroundColor: color,
            }

            const node = new CalloutNode(payload)
            return { node }
          },
          priority: 1 as const,
        }
      }
      return null
    },
  }
}
