// @vitest-environment happy-dom

import { SettingsCheckbox } from '@kobato/web-admin/ui/settings/shell/SettingsCheckbox'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

describe('ui/admin/settings/shell/SettingsCheckbox', () => {
  it('calls the upstream handler with the new value, then save', () => {
    const onCheckedChange = vi.fn()
    const save = vi.fn()
    render(
      <SettingsCheckbox
        name="new-tab"
        aria-label="new-tab"
        checked={false}
        onCheckedChange={onCheckedChange}
        save={save}
      />,
    )

    fireEvent.click(screen.getByRole('checkbox'))

    expect(onCheckedChange).toHaveBeenCalledWith(true, expect.anything())
    expect(save).toHaveBeenCalledWith('new-tab')
    expect(onCheckedChange.mock.invocationCallOrder[0]).toBeLessThan(save.mock.invocationCallOrder[0])
  })

  it('still saves when no upstream handler is given', () => {
    const save = vi.fn()
    render(<SettingsCheckbox name="new-tab" aria-label="new-tab" checked={true} save={save} />)

    fireEvent.click(screen.getByRole('checkbox'))

    expect(save).toHaveBeenCalledOnce()
  })
})
