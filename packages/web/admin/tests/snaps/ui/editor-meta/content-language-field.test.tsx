import { uiMessagesFor } from '@kobato/i18n/catalog.ts'
import { SUPPORTED_LOCALES } from '@kobato/i18n/locales.ts'
import { ContentLanguageField } from '@kobato/web-admin/ui/editor-meta/ContentLanguageField.tsx'
import { renderInRouter } from '@kobato/web-client/tests/utils/render.tsx'
import { describe, expect, it } from 'vitest'

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
