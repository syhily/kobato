// @vitest-environment happy-dom

import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { SettingsSwitch } from '@/ui/admin/settings/shell/SettingsSwitch'

// The wrapper's contract: the upstream `onCheckedChange` (RHF `field.onChange`
// at the call sites) fires first with the new value, then `save()` commits the
// card — the merge that used to be hand-copied inline at every switch.

describe('ui/admin/settings/shell/SettingsSwitch', () => {
  it('calls the upstream handler with the new value, then save', () => {
    const onCheckedChange = vi.fn()
    const save = vi.fn()
    render(
      <SettingsSwitch name="track" aria-label="track" checked={false} onCheckedChange={onCheckedChange} save={save} />,
    )

    fireEvent.click(screen.getByRole('switch'))

    expect(onCheckedChange).toHaveBeenCalledWith(true, expect.anything())
    expect(save).toHaveBeenCalledWith('track')
    expect(onCheckedChange.mock.invocationCallOrder[0]).toBeLessThan(save.mock.invocationCallOrder[0])
  })

  it('still saves when no upstream handler is given', () => {
    const save = vi.fn()
    render(<SettingsSwitch name="track" aria-label="track" checked={true} save={save} />)

    fireEvent.click(screen.getByRole('switch'))

    expect(save).toHaveBeenCalledOnce()
  })

  it('passes through disabled and does not fire either callback', () => {
    const onCheckedChange = vi.fn()
    const save = vi.fn()
    render(
      <SettingsSwitch
        name="track"
        aria-label="track"
        checked={false}
        disabled
        onCheckedChange={onCheckedChange}
        save={save}
      />,
    )

    fireEvent.click(screen.getByRole('switch'))

    expect(onCheckedChange).not.toHaveBeenCalled()
    expect(save).not.toHaveBeenCalled()
  })
})
