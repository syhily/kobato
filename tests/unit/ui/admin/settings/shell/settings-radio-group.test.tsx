// @vitest-environment happy-dom

import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { SettingsRadioGroup } from '@/ui/admin/settings/shell/SettingsRadioGroup'
import { RadioGroupItem } from '@/ui/components/radio-group'

// Same merge contract as SettingsSwitch: picking a radio option fires the
// upstream `onValueChange` first, then `save()`.

describe('ui/admin/settings/shell/SettingsRadioGroup', () => {
  it('calls the upstream handler with the picked value, then save', () => {
    const onValueChange = vi.fn()
    const save = vi.fn()
    render(
      <SettingsRadioGroup name="sort" value="like" onValueChange={onValueChange} save={save}>
        <RadioGroupItem value="like" aria-label="mode-like" />
        <RadioGroupItem value="trgm" aria-label="mode-trgm" />
      </SettingsRadioGroup>,
    )

    fireEvent.click(screen.getByRole('radio', { name: 'mode-trgm' }))

    expect(onValueChange).toHaveBeenCalledWith('trgm', expect.anything())
    expect(save).toHaveBeenCalledWith('sort')
    expect(onValueChange.mock.invocationCallOrder[0]).toBeLessThan(save.mock.invocationCallOrder[0])
  })

  it('still saves when no upstream handler is given', () => {
    const save = vi.fn()
    render(
      <SettingsRadioGroup name="sort" value="like" save={save}>
        <RadioGroupItem value="like" aria-label="mode-like" />
        <RadioGroupItem value="vector" aria-label="mode-vector" />
      </SettingsRadioGroup>,
    )

    fireEvent.click(screen.getByRole('radio', { name: 'mode-vector' }))

    expect(save).toHaveBeenCalledOnce()
  })
})
