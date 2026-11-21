import type { DOMConversion } from 'lexical'

export const paragraphSerializers = {
  import: {
    p: (node: HTMLElement): DOMConversion | null => {
      const isGoogleDocs = !!node.closest('[id^="docs-internal-guid-"]')

      if (isGoogleDocs && node.textContent === '') {
        return {
          conversion: () => null,
          priority: 1,
        }
      }

      return null
    },
  },
}
