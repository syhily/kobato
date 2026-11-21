// @vitest-environment happy-dom

import { ComboboxContent, ComboboxTrigger, ComboboxValue } from '@kobato/ui/components/combobox'
import { renderWithI18n } from '@kobato/ui/tests/utils/i18n-render'
import { SettingsCombobox } from '@kobato/web-admin/ui/settings/shell/SettingsCombobox'
import { fireEvent, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

describe('settings combobox defaults', () => {
  it('falls back to the localized placeholder and empty copy when no props are given', async () => {
    renderWithI18n(
      <SettingsCombobox<{ value: string; label: string }>
        name="zone"
        items={[{ value: 'UTC', label: 'UTC' }]}
        value={{ value: 'UTC', label: 'UTC' }}
        save={() => {}}
      >
        <ComboboxTrigger aria-label="timezone">
          <ComboboxValue />
        </ComboboxTrigger>
        <ComboboxContent<{ value: string; label: string }>>
          {(item) => <div key={item.value}>{item.label}</div>}
        </ComboboxContent>
      </SettingsCombobox>,
      { locale: 'en-US' },
    )

    fireEvent.click(screen.getByRole('combobox', { name: 'timezone' }))
    expect(screen.getByPlaceholderText('Search…')).toBeTruthy()
    fireEvent.change(screen.getByPlaceholderText('Search…'), { target: { value: 'zzz' } })
    expect(await screen.findByText('No matching results')).toBeTruthy()
  })
})
