import type { ContentSettings } from '@kobato/settings/types.ts'

import { DEFAULT_FOOTNOTES_SECTION_TITLE, resolveFootnotesSectionTitle } from '@kobato/settings/presentation.ts'
import { describe, expect, it } from 'vitest'

function content(footnotes?: { sectionTitle?: string }): ContentSettings {
  return { footnotes } as ContentSettings
}

// One exported default feeds the settings seed, the admin form fallback and the
// projection resolver — the three call sites must never drift.
describe('settings/footnotes-section-title', () => {
  it('exports the pre-i18n default title verbatim', () => {
    expect(DEFAULT_FOOTNOTES_SECTION_TITLE).toBe('尾声礼记')
  })

  it('falls back to the default for a missing or blank override', () => {
    expect(resolveFootnotesSectionTitle(content())).toBe(DEFAULT_FOOTNOTES_SECTION_TITLE)
    expect(resolveFootnotesSectionTitle(content({ sectionTitle: '   ' }))).toBe(DEFAULT_FOOTNOTES_SECTION_TITLE)
  })

  it('keeps a configured title', () => {
    expect(resolveFootnotesSectionTitle(content({ sectionTitle: 'Notes' }))).toBe('Notes')
  })
})
