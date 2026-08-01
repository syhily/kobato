// @vitest-environment happy-dom

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { SettingsSelect } from '@/ui/admin/settings/shell/SettingsSelect'
import { SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/components/select'

// Same merge contract as SettingsSwitch: picking an option fires the upstream
// `onValueChange` first, then `save()`. Base UI's SelectItem only commits a
// mouse selection that started on the item, so tests press pointerDown before
// the click (mirroring a real mouse).

function renderSelect(onValueChange: (value: string | null) => void, save: () => void) {
  return render(
    <SettingsSelect name="sort" value="asc" onValueChange={onValueChange} save={save}>
      <SelectTrigger aria-label="sort-dir">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="asc">最旧优先</SelectItem>
        <SelectItem value="desc">最新优先</SelectItem>
      </SelectContent>
    </SettingsSelect>,
  )
}

describe('ui/admin/settings/shell/SettingsSelect', () => {
  it('calls the upstream handler with the picked value, then save', async () => {
    const onValueChange = vi.fn()
    const save = vi.fn()
    renderSelect(onValueChange, save)

    fireEvent.click(screen.getByRole('combobox', { name: 'sort-dir' }))
    const option = await screen.findByRole('option', { name: '最新优先' })
    fireEvent.pointerDown(option)
    fireEvent.click(option)

    await waitFor(() => expect(onValueChange).toHaveBeenCalledWith('desc', expect.anything()))
    expect(save).toHaveBeenCalledWith('sort')
    expect(onValueChange.mock.invocationCallOrder[0]).toBeLessThan(save.mock.invocationCallOrder[0])
  })

  it('still saves when no upstream handler is given', async () => {
    const save = vi.fn()
    render(
      <SettingsSelect name="sort" value="asc" save={save}>
        <SelectTrigger aria-label="sort-dir">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="asc">最旧优先</SelectItem>
          <SelectItem value="desc">最新优先</SelectItem>
        </SelectContent>
      </SettingsSelect>,
    )

    fireEvent.click(screen.getByRole('combobox', { name: 'sort-dir' }))
    const option = await screen.findByRole('option', { name: '最新优先' })
    fireEvent.pointerDown(option)
    fireEvent.click(option)

    await waitFor(() => expect(save).toHaveBeenCalledOnce())
  })

  it('keeps call-site value transforms inside the upstream handler', async () => {
    // The BackupScheduleForm pattern: the raw option string is mapped before
    // reaching RHF (`(v) => field.onChange(Number(v))`).
    const onChange = vi.fn()
    const save = vi.fn()
    render(
      <SettingsSelect name="hour" value="8" onValueChange={(v) => onChange(Number(v))} save={save}>
        <SelectTrigger aria-label="hour">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="8">08</SelectItem>
          <SelectItem value="9">09</SelectItem>
        </SelectContent>
      </SettingsSelect>,
    )

    fireEvent.click(screen.getByRole('combobox', { name: 'hour' }))
    const option = await screen.findByRole('option', { name: '09' })
    fireEvent.pointerDown(option)
    fireEvent.click(option)

    await waitFor(() => expect(onChange).toHaveBeenCalledWith(9))
    expect(save).toHaveBeenCalledOnce()
  })
})
