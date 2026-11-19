import { LOCALE_DISPLAY_NAMES, SUPPORTED_LOCALES } from '@kobato/i18n/locales.ts'
import { TEST_BLOG_SETTINGS_BUNDLE } from '@kobato/test/blog-settings.ts'
import { wrapWithI18n } from '@kobato/test/i18n-render.tsx'
import { I18N_SETTINGS_ENABLED } from '@kobato/web-admin/ui/settings/feature-flags.ts'
import { GeneralForm } from '@kobato/web-admin/ui/settings/general/GeneralForm.tsx'
import { SettingsFlushProvider } from '@kobato/web-admin/ui/settings/shell/SettingsFlushProvider.tsx'
// @vitest-environment happy-dom
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@kobato/web-admin/ui/settings/use-settings-mutation.ts', () => ({
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
    expect(trigger!.textContent).toContain(LOCALE_DISPLAY_NAMES[siteIdentity.locale])

    fireEvent.click(trigger!)
    await waitFor(() => expect(screen.getAllByRole('option').length).toBe(SUPPORTED_LOCALES.length))
    for (const locale of SUPPORTED_LOCALES) {
      expect(screen.getByRole('option', { name: LOCALE_DISPLAY_NAMES[locale] })).toBeInTheDocument()
    }
  })
})
