// Single owner of the footnote anchor DOM contract: both render adapters
// MUST emit byte-identical anchors, and the client sniffer matches the
// same prefixes. Raw literals outside this module are a drift bug.
export const FOOTNOTE_ID_PREFIX = 'user-content-fn-'
export const FOOTNOTE_REF_ID_PREFIX = 'user-content-fnref-'

/** Marker attribute on the back-reference link inside a definition row. */
export const FOOTNOTE_BACKREF_ATTRIBUTE = 'data-footnote-backref'
export const FOOTNOTE_BACKREF_ARIA_LABEL = '返回引用'

/** `id` of the footnotes-section heading; the `<section>` points at it via `aria-labelledby`. */
export const FOOTNOTES_SECTION_HEADING_ID = 'footnotes-section-heading'

export function footnoteAnchorId(index: number): string {
  return `${FOOTNOTE_ID_PREFIX}${index}`
}

export function footnoteRefId(index: number): string {
  return `${FOOTNOTE_REF_ID_PREFIX}${index}`
}

export function footnoteAnchorHref(index: number): string {
  return `#${footnoteAnchorId(index)}`
}

export function footnoteRefHref(index: number): string {
  return `#${footnoteRefId(index)}`
}
