import { describe, expect, it } from 'vitest'

import { renderInRouter } from '#/_helpers/render'
import { uiMessagesFor } from '@/shared/i18n/catalog'
import { SUPPORTED_LOCALES } from '@/shared/i18n/locales'
import { ContentLanguageField } from '@/ui/admin/editor-shared/ContentLanguageField'

// The editor's one content-language control: label, hint and error exist in every UI
// locale while the value is author data (never translated). A missing translation falls
// back to English, so the "differs from the baseline" leg fails.

function render(value: string, locale: (typeof SUPPORTED_LOCALES)[number]): string {
  return renderInRouter(
    <ContentLanguageField id="post-content-language" value={value} onChange={() => undefined} />,
    '/',
    { locale },
  )
}

describe('snapshot: ContentLanguageField', () => {
  it.each(SUPPORTED_LOCALES)('renders the label and hint in %s', (locale) => {
    const messages = uiMessagesFor(locale)
    const html = render('zh-Hant-TW', locale)

    expect(html).toContain(messages['admin.editor.contentLanguage.label'])
    expect(html).toContain(messages['admin.editor.contentLanguage.hint'])
    // Author data is rendered verbatim, not localized.
    expect(html).toContain('value="zh-Hant-TW"')
    expect(html).not.toContain(messages['admin.editor.contentLanguage.error'])
    expect(html).not.toContain('aria-invalid="true"')
  })

  it('uses distinct copy per locale rather than the English fallback', () => {
    const english = uiMessagesFor('en-US')
    for (const locale of SUPPORTED_LOCALES) {
      const messages = uiMessagesFor(locale)
      if (locale === 'en-US') {
        continue
      }
      expect(messages['admin.editor.contentLanguage.label']).not.toBe(english['admin.editor.contentLanguage.label'])
      expect(messages['admin.editor.contentLanguage.hint']).not.toBe(english['admin.editor.contentLanguage.hint'])
      expect(messages['admin.editor.contentLanguage.error']).not.toBe(english['admin.editor.contentLanguage.error'])
    }
  })

  it.each(SUPPORTED_LOCALES)('flags a malformed tag with the %s error copy', (locale) => {
    const messages = uiMessagesFor(locale)
    const html = render('zh_CN', locale)

    expect(html).toContain(messages['admin.editor.contentLanguage.error'])
    expect(html).toContain('aria-invalid="true"')
    expect(html).toContain('role="alert"')
  })

  it('treats an empty field as valid (unset)', () => {
    const messages = uiMessagesFor('zh-CN')
    const html = render('', 'zh-CN')

    expect(html).not.toContain(messages['admin.editor.contentLanguage.error'])
  })
})
