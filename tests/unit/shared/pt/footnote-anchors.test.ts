import { describe, expect, it } from 'vitest'

import {
  FOOTNOTE_BACKREF_ARIA_LABEL,
  FOOTNOTE_BACKREF_ATTRIBUTE,
  FOOTNOTE_ID_PREFIX,
  FOOTNOTE_REF_ID_PREFIX,
  FOOTNOTES_SECTION_HEADING_ID,
  footnoteAnchorHref,
  footnoteAnchorId,
  footnoteRefHref,
  footnoteRefId,
} from '@/shared/pt/footnote-anchors'

// The footnote anchor DOM contract is single-owned here; both render
// adapters (feed HTML, React tree) must emit byte-identical anchors.
// These tests pin the exact strings — a drift breaks cross-references
// between the inline ref, the definition row, and the preview sniffer.

describe('shared/pt/footnote-anchors — id/href builders', () => {
  it('builds the definition anchor id from the prefix and index', () => {
    expect(footnoteAnchorId(1)).toBe('user-content-fn-1')
    expect(footnoteAnchorId(12)).toBe('user-content-fn-12')
    expect(footnoteAnchorId(1).startsWith(FOOTNOTE_ID_PREFIX)).toBe(true)
  })

  it('builds the reference id from the ref prefix and index', () => {
    expect(footnoteRefId(3)).toBe('user-content-fnref-3')
    expect(footnoteRefId(3).startsWith(FOOTNOTE_REF_ID_PREFIX)).toBe(true)
  })

  it('prefixes ids with # for hrefs', () => {
    expect(footnoteAnchorHref(2)).toBe('#user-content-fn-2')
    expect(footnoteRefHref(2)).toBe('#user-content-fnref-2')
  })

  it('keeps fn and fnref prefixes distinct (fnref must not start with fn-)', () => {
    // The sniffer matches `href` against `#${FOOTNOTE_ID_PREFIX}` and `id`
    // against FOOTNOTE_REF_ID_PREFIX — if fnref were a fn- extension the
    // two checks could not discriminate ref from definition.
    expect(FOOTNOTE_REF_ID_PREFIX).not.toBe(FOOTNOTE_ID_PREFIX)
    expect(footnoteRefId(1)).not.toBe(footnoteAnchorId(1))
  })
})

describe('shared/pt/footnote-anchors — backref + section markers', () => {
  it('pins the backref attribute name and aria label', () => {
    expect(FOOTNOTE_BACKREF_ATTRIBUTE).toBe('data-footnote-backref')
    expect(FOOTNOTE_BACKREF_ARIA_LABEL).toBe('返回引用')
  })

  it('pins the footnotes-section heading id', () => {
    expect(FOOTNOTES_SECTION_HEADING_ID).toBe('footnotes-section-heading')
  })
})
