// @vitest-environment happy-dom

// Pins the two-click custom-range flow: the first calendar click only sets
// the start day (no search fires), the second completes the range and
// commits it. Regression test for react-day-picker v10 completing a
// same-day range on the first click without `resetOnSelect`.

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { DateRange } from '@/shared/contracts/analytics'

import { DateRangePicker } from '@/ui/admin/analytics/DateRangePicker'

const RANGE: DateRange = { startAt: 1_700_000_000, endAt: 1_700_100_000 }

function startOfDaySec(date: Date): number {
  return Math.floor(new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime() / 1000)
}

function startOfNextDaySec(date: Date): number {
  return Math.floor(new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1).getTime() / 1000)
}

/** Day button for the given date (the calendar marks days via `data-day`). */
function dayButton(date: Date): HTMLElement {
  const el = document.querySelector<HTMLElement>(`[data-day="${date.toLocaleDateString()}"]`)
  if (!el) {
    throw new Error(`day button not found: ${date.toLocaleDateString()}`)
  }
  return el
}

// Pick selectable days guaranteed inside the current month (never disabled,
// never duplicated as outside days of the adjacent rendered month).
function pickDays(): { startDay: Date; endDay: Date } {
  const now = new Date()
  const startDay = new Date(now.getFullYear(), now.getMonth(), 1)
  const endDay = now.getDate() >= 2 ? new Date(now.getFullYear(), now.getMonth(), 2) : startDay
  return { startDay, endDay }
}

async function openCustomPicker() {
  // The trigger shows 自定义 while a preset is active and the formatted
  // range (containing the – separator) once a custom range is applied.
  fireEvent.click(screen.getByRole('button', { name: /自定义|–/ }))
  await waitFor(() => {
    expect(document.querySelector('[data-day]')).toBeTruthy()
  })
}

describe('DateRangePicker custom range', () => {
  it('commits only after the second click completes the range', async () => {
    const onSelectRange = vi.fn()
    render(<DateRangePicker preset="last-7d" range={RANGE} onSelect={() => {}} onSelectRange={onSelectRange} />)
    await openCustomPicker()

    const { startDay, endDay } = pickDays()
    fireEvent.click(dayButton(startDay))
    expect(onSelectRange).not.toHaveBeenCalled()

    fireEvent.click(dayButton(endDay))
    expect(onSelectRange).toHaveBeenCalledTimes(1)
    expect(onSelectRange).toHaveBeenCalledWith({
      startAt: startOfDaySec(startDay),
      endAt: startOfNextDaySec(endDay),
    })
  })

  it('restarting from an active custom range also needs two clicks', async () => {
    const onSelectRange = vi.fn()
    render(<DateRangePicker preset={null} range={RANGE} onSelect={() => {}} onSelectRange={onSelectRange} />)
    await openCustomPicker()

    const { startDay, endDay } = pickDays()
    fireEvent.click(dayButton(startDay))
    expect(onSelectRange).not.toHaveBeenCalled()

    fireEvent.click(dayButton(endDay))
    expect(onSelectRange).toHaveBeenCalledTimes(1)
  })

  it('a discarded partial range does not leak into the next open', async () => {
    const onSelectRange = vi.fn()
    render(<DateRangePicker preset="last-7d" range={RANGE} onSelect={() => {}} onSelectRange={onSelectRange} />)
    await openCustomPicker()

    const { startDay, endDay } = pickDays()
    fireEvent.click(dayButton(startDay))
    expect(onSelectRange).not.toHaveBeenCalled()

    // Close without completing, then reopen — the pending start must reset.
    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => {
      expect(document.querySelector('[data-day]')).toBeNull()
    })
    await openCustomPicker()

    fireEvent.click(dayButton(startDay))
    expect(onSelectRange).not.toHaveBeenCalled()
    fireEvent.click(dayButton(endDay))
    expect(onSelectRange).toHaveBeenCalledTimes(1)
  })
})
