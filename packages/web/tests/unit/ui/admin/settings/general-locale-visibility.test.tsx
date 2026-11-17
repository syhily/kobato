import { I18N_SETTINGS_ENABLED } from '@kobato/shared/i18n/feature-flags.ts'
import { LOCALE_DISPLAY_NAMES, SUPPORTED_LOCALES } from '@kobato/shared/i18n/locales.ts'
import { TEST_BLOG_SETTINGS_BUNDLE } from '@kobato/test/blog-settings.ts'
import { wrapWithI18n } from '@kobato/test/i18n-render.tsx'
import { GeneralForm } from '@kobato/web/ui/admin/settings/GeneralForm.tsx'
import { SettingsFlushProvider } from '@kobato/web/ui/admin/settings/shell/SettingsFlushProvider.tsx'
// @vitest-environment happy-dom
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

// The released surface. The real flag is ON — this file never mocks
// it — so the General card exposes the language selector and all four options
// exactly as an admin sees it.

vi.mock('@kobato/web/ui/admin/settings/useSettingsMutation.ts', () => ({
  useSettingsMutation: () => ({
    commit: vi.fn(async () => ({ ok: true, section: {} })),
    isPending: false,
    status: 'idle',
  }),
}))

vi.mock('sonner', () => ({ toast: { error: vi.fn(), warning: vi.fn(), success: vi.fn() }, Toaster: () => null }))

const siteIdentity = TEST_BLOG_SETTINGS_BUNDLE.siteIdentity!

describe('General locale selector — released surface', () => {
  it('has the release flag switched on', () => {
    expect(I18N_SETTINGS_ENABLED).toBe(true)
  })

  it('renders the language selector with every supported locale on offer', async () => {
    render(
      wrapWithI18n(
        <SettingsFlushProvider>
          <GeneralForm siteIdentity={siteIdentity} timeZones={['Asia/Shanghai']} />
        </SettingsFlushProvider>,
      ),
    )

    const trigger = document.getElementById('general-locale')
    expect(trigger).not.toBeNull()
    // The trigger shows the CURRENT locale's endonym.
    expect(trigger!.textContent).toContain(LOCALE_DISPLAY_NAMES[siteIdentity.locale])

    fireEvent.click(trigger!)
    await waitFor(() => expect(screen.getAllByRole('option').length).toBe(SUPPORTED_LOCALES.length))
    for (const locale of SUPPORTED_LOCALES) {
      expect(screen.getByRole('option', { name: LOCALE_DISPLAY_NAMES[locale] })).toBeInTheDocument()
    }
  })
})
