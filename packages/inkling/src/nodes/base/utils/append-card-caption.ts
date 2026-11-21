import type { RenderContext } from '@kobato/inkling-internal/nodes/base/render-context'

export type CardCaptionPolicy = 'sanitize' | 'escape'

export const CARD_CAPTION_MARKER_CLASS = 'inkling-card-hascaption'

function renderCaptionContent(caption: string, context: RenderContext, policy: CardCaptionPolicy): string {
  return policy === 'escape' ? context.escapeText(caption) : context.sanitizeBasicHtml(caption)
}

export function renderCardCaptionHtml(
  caption: string,
  context: RenderContext,
  policy: CardCaptionPolicy = 'sanitize',
): string {
  return `<figcaption>${renderCaptionContent(caption, context, policy)}</figcaption>`
}

export function appendCardCaption(
  figure: HTMLElement,
  caption: string,
  context: RenderContext,
  policy: CardCaptionPolicy = 'sanitize',
): void {
  figure.setAttribute('class', `${figure.getAttribute('class') ?? ''} ${CARD_CAPTION_MARKER_CLASS}`.trim())
  const figcaption = figure.ownerDocument.createElement('figcaption')
  figcaption.innerHTML = renderCaptionContent(caption, context, policy)
  figure.appendChild(figcaption)
}
