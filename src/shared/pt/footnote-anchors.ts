// Single owner of the footnote anchor DOM contract. PT ships two render
// adapters — the feed HTML string (src/server/render/pt-html) and the
// React tree (src/ui/pt/) — and both MUST emit byte-identical anchors so
// a reference and its definition always resolve to the same target. The
// React client's footnote-preview sniffer (src/ui/pt/Footnotes) matches
// on the same prefixes. Raw `user-content-fn-` literals outside this
// module are a contract drift bug.

export const FOOTNOTE_ID_PREFIX = 'user-content-fn-'
export const FOOTNOTE_REF_ID_PREFIX = 'user-content-fnref-'

/** Marker attribute on the back-reference link inside a definition row. */
export const FOOTNOTE_BACKREF_ATTRIBUTE = 'data-footnote-backref'
export const FOOTNOTE_BACKREF_ARIA_LABEL = '返回引用'

/** `id` of the footnotes-section heading; the `<section>` points at it via `aria-labelledby`. */
export const FOOTNOTES_SECTION_HEADING_ID = 'footnotes-section-heading'

/** `id` of the definition list item (`<li id="user-content-fn-N">`). */
export function footnoteAnchorId(index: number): string {
  return `${FOOTNOTE_ID_PREFIX}${index}`
}

/** `id` of the inline reference (`<sup id="user-content-fnref-N">`). */
export function footnoteRefId(index: number): string {
  return `${FOOTNOTE_REF_ID_PREFIX}${index}`
}

/** `href` pointing at the definition (`#user-content-fn-N`). */
export function footnoteAnchorHref(index: number): string {
  return `#${footnoteAnchorId(index)}`
}

/** `href` pointing back at the inline reference (`#user-content-fnref-N`). */
export function footnoteRefHref(index: number): string {
  return `#${footnoteRefId(index)}`
}
