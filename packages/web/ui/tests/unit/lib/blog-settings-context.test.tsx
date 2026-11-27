import type { BlogSettingsBundle, FontsSettings } from '@kobato/settings/types'
import type { ReactNode } from 'react'

import { TEST_BLOG_SETTINGS_BUNDLE } from '@kobato/settings/tests/utils/blog-settings'
import { DocumentProviders } from '@kobato/ui/components/document-shell/DocumentProviders'
import { BlogSettingsProvider, useFontsSettings, useFontsSettingsOptional } from '@kobato/ui/lib/blog-settings-context'
import { DocumentFactsProvider } from '@kobato/ui/lib/document-facts-context'
import { documentFactsFor } from '@kobato/ui/tests/utils/document-facts'
import { wrapWithI18n } from '@kobato/ui/tests/utils/i18n-render'
import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

const FONTS: FontsSettings = {
  og: { family: 'NotoSansCJK' },
  calendar: { family: 'LXGWWenKai' },
  global: ['font-global'],
  post: ['font-post'],
  code: ['font-code'],
}

function renderWithBundle<T>(hook: () => T, bundle: BlogSettingsBundle | undefined) {
  return renderHook(hook, {
    wrapper: ({ children }: { children: ReactNode }) => (
      <BlogSettingsProvider value={bundle}>{children}</BlogSettingsProvider>
    ),
  })
}

function renderThroughDocumentProviders<T>(hook: () => T, settings: BlogSettingsBundle | undefined) {
  return renderHook(hook, {
    wrapper: ({ children }: { children: ReactNode }) =>
      wrapWithI18n(
        <DocumentFactsProvider value={documentFactsFor({ settings })}>
          <DocumentProviders>{children}</DocumentProviders>
        </DocumentFactsProvider>,
      ),
  })
}

describe('lib/blog-settings-context — useFontsSettings', () => {
  it('hands the fonts section of the bundle to its readers untouched', () => {
    const bundle = { ...TEST_BLOG_SETTINGS_BUNDLE, fonts: FONTS }
    expect(renderWithBundle(() => useFontsSettings(), bundle).result.current).toBe(FONTS)
  })

  it('is one of the sections the document providers seed from the document settings', () => {
    const settings = { ...TEST_BLOG_SETTINGS_BUNDLE, fonts: FONTS }
    expect(renderThroughDocumentProviders(() => useFontsSettings(), settings).result.current).toBe(FONTS)
    expect(renderThroughDocumentProviders(() => useFontsSettings(), TEST_BLOG_SETTINGS_BUNDLE).result.current).toBe(
      TEST_BLOG_SETTINGS_BUNDLE.fonts,
    )
  })

  it('throws a named error when the section has not been seeded', () => {
    expect(() =>
      renderWithBundle(() => useFontsSettings(), { ...TEST_BLOG_SETTINGS_BUNDLE, fonts: null }),
    ).toThrowError(/useFontsSettings/)
    expect(() => renderWithBundle(() => useFontsSettings(), undefined)).toThrowError(/useFontsSettings/)
    expect(() => renderThroughDocumentProviders(() => useFontsSettings(), undefined)).toThrowError(/useFontsSettings/)
  })
})

describe('lib/blog-settings-context — useFontsSettingsOptional', () => {
  it('is the section once it is seeded', () => {
    const bundle = { ...TEST_BLOG_SETTINGS_BUNDLE, fonts: FONTS }
    expect(renderWithBundle(() => useFontsSettingsOptional(), bundle).result.current).toBe(FONTS)
  })

  it('is undefined without a bundle or when the section has not been seeded', () => {
    expect(
      renderWithBundle(() => useFontsSettingsOptional(), { ...TEST_BLOG_SETTINGS_BUNDLE, fonts: null }).result.current,
    ).toBeUndefined()
    expect(renderWithBundle(() => useFontsSettingsOptional(), undefined).result.current).toBeUndefined()
    expect(renderThroughDocumentProviders(() => useFontsSettingsOptional(), undefined).result.current).toBeUndefined()
  })
})
