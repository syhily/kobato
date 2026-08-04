// Lexical-track copy of the footnote anchor DOM contract. The PT render
// adapters (feed HTML + React tree) and the client footnote-preview
// sniffer match on these prefixes — the future Lexical renderer MUST
// emit the same anchors so a reference and its definition always resolve
// to the same target. Constants are byte-identical to
// `@kobato/shared/pt/footnote-anchors`; the original file stays the
// owner until the PT track is retired (dual-track period), this copy
// exists so lexical-side consumers never import the PT module.
//
// Raw `user-content-fn-` literals outside this module are a contract
// drift bug.

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
