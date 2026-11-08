// @vitest-environment happy-dom

import { fireEvent, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { renderWithI18n } from '#/_helpers/i18n-render'
import { SETTINGS_SKIP_COMMIT } from '@/ui/admin/settings/shell/settings-change-verdict'
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

function deferred() {
  let release!: () => void
  const promise = new Promise<void>((resolve) => {
    release = resolve
  })
  return { promise, release }
}

const flushMicrotasks = () => new Promise((resolve) => setImmediate(resolve))

describe('ui/admin/settings/shell/SettingsCombobox', () => {
  it('awaits an async upstream handler BEFORE save', async () => {
    const gate = deferred()
    const onChange = vi.fn()
    const save = vi.fn()
    renderWithI18n(
      <SettingsCombobox<ZoneItem>
        name="zone"
        items={ZONES}
        value={ZONES[0]}
        save={save}
        onValueChange={async (item) => {
          await gate.promise
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

    await flushMicrotasks()
    expect(onChange).not.toHaveBeenCalled()
    expect(save).not.toHaveBeenCalled()

    gate.release()
    await waitFor(() => expect(onChange).toHaveBeenCalledWith('UTC'))
    await waitFor(() => expect(save).toHaveBeenCalledWith('zone'))
  })

  it('does not save when the upstream guard vetoes the change', async () => {
    const guard = vi.fn(async () => SETTINGS_SKIP_COMMIT)
    const save = vi.fn()
    renderWithI18n(
      <SettingsCombobox<ZoneItem> name="zone" items={ZONES} value={ZONES[0]} save={save} onValueChange={guard}>
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

    await waitFor(() => expect(guard).toHaveBeenCalledOnce())
    await flushMicrotasks()
    expect(save).not.toHaveBeenCalled()
  })

  it('runs the guarded upstream handler, then save', async () => {
    const onChange = vi.fn()
    const save = vi.fn()
    renderWithI18n(
      <SettingsCombobox<ZoneItem>
        name="zone"
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
    expect(save).toHaveBeenCalledWith('zone')
  })
})
