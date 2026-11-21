import type { DOMConversion } from 'lexical'

export const linebreakSerializers = {
  import: {
    br: (node: HTMLElement): DOMConversion | null => {
      const isGoogleDocs = !!node.closest('[id^="docs-internal-guid-"]')
      const previousNodeName = node.previousElementSibling?.nodeName
      const nextNodeName = node.nextElementSibling?.nodeName
      const headings = ['H1', 'H2', 'H3', 'H4', 'H5', 'H6']
      const lists = ['UL', 'OL', 'DL']

      if (isGoogleDocs) {
        if (
          (previousNodeName === 'P' && nextNodeName === 'P') ||
          previousNodeName === 'BR' ||
          nextNodeName === 'BR' ||
          (previousNodeName && [...headings, ...lists].includes(previousNodeName) && nextNodeName === 'P') ||
          (previousNodeName === 'P' && nextNodeName && [...headings, ...lists].includes(nextNodeName))
        ) {
          return {
            conversion: () => null,
            priority: 1,
          }
        }
      }

      return null
    },
  },
}
