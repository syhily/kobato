import type { RenderContext } from '@/nodes/base/render-context'

/*
 * The caption/figcaption pairing invariant (CONTEXT.md "render context"):
 * a card with a caption exports the `inkling-card-hascaption` marker class
 * AND a `<figcaption>` — one fact, one home, so neither leg can ship
 * without the other and the marker class always lands last on the class
 * list (the pinned export order). The image, gallery, bookmark, and
 * codeblock renderers are the DOM adapters (`appendCardCaption`); video is
 * the template adapter (`renderCardCaptionHtml` + the marker constant in
 * its `getCardClasses`).
 *
 * The content policy is named data, not per-renderer knowledge: 'sanitize'
 * runs the render context's basic-HTML config; 'escape' is video's pinned
 * plan-040 divergence (DOMPurify cannot reproduce `escapeHtml` on the
 * pinned video-caption corpus — recorded at `escapeText` in the render
 * context).
 */
export type CardCaptionPolicy = 'sanitize' | 'escape'

/** The marker class half of the pairing — video's `getCardClasses` is the template-side consumer. */
export const CARD_CAPTION_MARKER_CLASS = 'inkling-card-hascaption'

function renderCaptionContent(caption: string, context: RenderContext, policy: CardCaptionPolicy): string {
  return policy === 'escape' ? context.escapeText(caption) : context.sanitizeBasicHtml(caption)
}

/** The `<figcaption>` half of the pairing, for template-string renderers (video). */
export function renderCardCaptionHtml(
  caption: string,
  context: RenderContext,
  policy: CardCaptionPolicy = 'sanitize',
): string {
  return `<figcaption>${renderCaptionContent(caption, context, policy)}</figcaption>`
}

/** The whole pairing, for DOM-building renderers (image, gallery, bookmark, codeblock). */
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
