import { cleanBasicHtml } from '@/html/clean-basic-html'

export function readCaptionFromElement(element: Element, { selector = 'figcaption' } = {}): string | undefined {
  let caption: string | undefined

  const figcaptions = Array.from(element.querySelectorAll(selector))
  if (figcaptions.length) {
    figcaptions.forEach((figcaption) => {
      const cleanHtml = cleanBasicHtml(figcaption.innerHTML, { ownerDocument: element.ownerDocument })
      if (!cleanHtml.trim()) {
        return
      }
      caption = caption ? `${caption} / ${cleanHtml}` : cleanHtml
    })
  }

  return caption
}
