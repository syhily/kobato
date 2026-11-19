export const FOOTNOTE_ID_PREFIX = 'user-content-fn-'
export const FOOTNOTE_REF_ID_PREFIX = 'user-content-fnref-'

export const FOOTNOTE_BACKREF_ATTRIBUTE = 'data-footnote-backref'

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
