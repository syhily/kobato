// @vitest-environment happy-dom

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { SettingsCombobox } from '@/ui/admin/settings/shell/SettingsCombobox'
import { ComboboxContent, ComboboxItem, ComboboxTrigger, ComboboxValue } from '@/ui/components/combobox'

// Same merge contract as SettingsSwitch, mirrored on the GeneralForm timezone
// card: the upstream handler keeps its null guard and item→value mapping, and
// `save()` fires after it.

interface ZoneItem {
  value: string
  label: string
}

const ZONES: ZoneItem[] = [
  { value: 'Asia/Shanghai', label: 'Asia/Shanghai' },
  { value: 'UTC', label: 'UTC' },
]

describe('ui/admin/settings/shell/SettingsCombobox', () => {
  it('runs the guarded upstream handler, then save', async () => {
    const onChange = vi.fn()
    const save = vi.fn()
    render(
      <SettingsCombobox<ZoneItem>
        items={ZONES}
        value={ZONES[0]}
        save={save}
        onValueChange={(item) => {
          if (item) {
            onChange(item.value)
          }
        }}
      >
        <ComboboxTrigger aria-label="timezone">
          <ComboboxValue />
        </ComboboxTrigger>
        <ComboboxContent<ZoneItem>>
          {(item) => (
            <ComboboxItem key={item.value} value={item}>
              {item.label}
            </ComboboxItem>
          )}
        </ComboboxContent>
      </SettingsCombobox>,
    )

    fireEvent.click(screen.getByRole('combobox', { name: 'timezone' }))
    const option = await screen.findByRole('option', { name: 'UTC' })
    fireEvent.pointerDown(option)
    fireEvent.click(option)

    await waitFor(() => expect(onChange).toHaveBeenCalledWith('UTC'))
    expect(save).toHaveBeenCalledOnce()
  })
})
