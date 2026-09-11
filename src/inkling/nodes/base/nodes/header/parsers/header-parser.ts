// Survives hand-written (no import spec, CONTEXT.md: "import spec"): the
// payload is derived, not read — buttonEnabled from element presence,
// two-source backgroundColor, and the version: 2 constant. layout/swapped/
// backgroundSize are read back from the classes the renderer emits
// (header-renderer.ts getCardClasses); hand-written markup has no layout
// classes, so it keeps the backgroundImageSrc-presence fallback for layout.
import type { LexicalNode } from 'lexical'

export function parseHeaderNode(BaseHeaderNode: new (data: Record<string, unknown>) => LexicalNode) {
  return {
    div: (nodeElem: HTMLElement) => {
      // tagName is guaranteed by Lexical's nodeName dispatch ('div' key)
      const isHeaderCardv2 =
        nodeElem.classList.contains('inkling-header-card') && nodeElem.classList.contains('inkling-v2')

      if (isHeaderCardv2) {
        return {
          conversion(domNode: HTMLElement) {
            const div = domNode
            const headerElement = div.querySelector('.inkling-header-card-heading')
            const subheaderElement = div.querySelector('.inkling-header-card-subheading')
            const buttonElement = div.querySelector('.inkling-header-card-button')
            // symmetric with the renderer: legacy markup with no alignment
            // class still reads back ''
            const textClasses = div.querySelector('.inkling-header-card-text')?.classList
            const alignment = textClasses?.contains('inkling-align-left')
              ? 'left'
              : textClasses?.contains('inkling-align-center')
                ? 'center'
                : ''
            const backgroundImageSrc = div.querySelector('.inkling-header-card-image')?.getAttribute('src')
            const isSplitLayout = div.classList.contains('inkling-layout-split')
            // split also emits inkling-width-full, so the split check wins;
            // hand-written markup has no layout classes and falls back to the
            // image-presence heuristic
            const exportedWidth = Array.from(div.classList)
              .find((cls) => cls.startsWith('inkling-width-'))
              ?.slice('inkling-width-'.length)
            const layout = isSplitLayout ? 'split' : exportedWidth || (backgroundImageSrc ? 'split' : '')
            const swapped = div.classList.contains('inkling-swapped')
            const backgroundSize = isSplitLayout && div.classList.contains('inkling-content-wide') ? 'contain' : 'cover'
            const backgroundColor = div.classList.contains('inkling-style-accent')
              ? 'accent'
              : div.getAttribute('data-background-color')
            const buttonColor = buttonElement?.getAttribute('data-button-color') || ''
            const textColor = headerElement?.getAttribute('data-text-color') || ''
            const buttonTextColor = buttonElement?.getAttribute('data-button-text-color') || ''
            const header = headerElement?.textContent || ''
            const subheader = subheaderElement?.textContent || ''
            const buttonEnabled = !!buttonElement
            const buttonUrl = buttonEnabled ? buttonElement.getAttribute('href') : ''
            const buttonText = buttonEnabled ? buttonElement.textContent : ''

            const payload: Record<string, unknown> = {
              backgroundColor,
              buttonColor,
              alignment,
              backgroundImageSrc,
              layout,
              swapped,
              backgroundSize,
              textColor,
              header,
              subheader,
              buttonEnabled,
              buttonUrl,
              buttonText,
              buttonTextColor,
              version: 2,
            }

            const node = new BaseHeaderNode(payload)
            return { node }
          },
          priority: 1 as const,
        }
      }
      return null
    },
  }
}
