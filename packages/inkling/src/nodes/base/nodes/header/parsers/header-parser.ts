import type { LexicalNode } from 'lexical'

export function parseHeaderNode(BaseHeaderNode: new (data: Record<string, unknown>) => LexicalNode) {
  return {
    div: (nodeElem: HTMLElement) => {
      const isHeaderCardv2 =
        nodeElem.classList.contains('inkling-header-card') && nodeElem.classList.contains('inkling-v2')

      if (isHeaderCardv2) {
        return {
          conversion(domNode: HTMLElement) {
            const div = domNode
            const headerElement = div.querySelector('.inkling-header-card-heading')
            const subheaderElement = div.querySelector('.inkling-header-card-subheading')
            const buttonElement = div.querySelector('.inkling-header-card-button')
            const textClasses = div.querySelector('.inkling-header-card-text')?.classList
            const alignment = textClasses?.contains('inkling-align-left')
              ? 'left'
              : textClasses?.contains('inkling-align-center')
                ? 'center'
                : ''
            const backgroundImageSrc = div.querySelector('.inkling-header-card-image')?.getAttribute('src')
            const isSplitLayout = div.classList.contains('inkling-layout-split')
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
