import { LOCALE_DISPLAY_NAMES, SUPPORTED_LOCALES } from '@kobato/i18n/locales'
import { TEST_BLOG_SETTINGS_BUNDLE } from '@kobato/settings/tests/utils/blog-settings'
import { wrapWithI18n } from '@kobato/ui/tests/utils/i18n-render'
import { I18N_SETTINGS_ENABLED } from '@kobato/web-admin/ui/settings/feature-flags'
import { GeneralForm } from '@kobato/web-admin/ui/settings/general/GeneralForm'
import { SettingsFlushProvider } from '@kobato/web-admin/ui/settings/shell/SettingsFlushProvider'
// @vitest-environment happy-dom
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterAll, describe, expect, it, vi } from 'vitest'

const settingsMutation = await import('@kobato/web-admin/ui/settings/use-settings-mutation')
vi.spyOn(settingsMutation, 'useSettingsMutation').mockImplementation(() => ({
  commit: vi.fn(async () => ({ ok: true, section: {} })),
  isPending: false,
  status: 'idle',
}))

afterAll(() => {
  vi.restoreAllMocks()
})

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
