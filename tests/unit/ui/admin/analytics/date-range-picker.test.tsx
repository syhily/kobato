// @vitest-environment happy-dom

// Pins the two-click custom-range flow: the first calendar click only sets
// the start day (no search fires), the second completes the range and
// commits it. Regression test for react-day-picker v10 completing a
// same-day range on the first click without `resetOnSelect`.

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { DateRange } from '@/shared/contracts/analytics'

import { wrapWithI18n } from '#/_helpers/i18n-render'
import { DateRangePicker } from '@/ui/admin/analytics/DateRangePicker'
import { calendarMachineDay } from '@/ui/components/calendar'

const RANGE: DateRange = { startAt: 1_700_000_000, endAt: 1_700_100_000 }

function startOfDaySec(date: Date): number {
  return Math.floor(new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime() / 1000)
}

function startOfNextDaySec(date: Date): number {
  return Math.floor(new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1).getTime() / 1000)
}

/** Day button for the given date (the calendar marks days via `data-day`). */
function dayButton(date: Date): HTMLElement {
  // `data-day` is the machine yyyy-MM-dd value the calendar stamps.
  const machineDay = calendarMachineDay(date)
  // DayPicker stamps `data-day` on its own day cell too; target OUR button
  // (the calendar's day button carries the same machine value).
  const el = document.querySelector<HTMLElement>(`button[data-day="${machineDay}"]`)
  if (!el) {
    throw new Error(`day button not found: ${machineDay}`)
  }
  return el
}

function renderPicker(ui: React.ReactElement) {
  return render(wrapWithI18n(ui))
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
    renderPicker(<DateRangePicker preset="last-7d" range={RANGE} onSelect={() => {}} onSelectRange={onSelectRange} />)
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
    renderPicker(<DateRangePicker preset={null} range={RANGE} onSelect={() => {}} onSelectRange={onSelectRange} />)
    await openCustomPicker()

    const { startDay, endDay } = pickDays()
    fireEvent.click(dayButton(startDay))
    expect(onSelectRange).not.toHaveBeenCalled()

    fireEvent.click(dayButton(endDay))
    expect(onSelectRange).toHaveBeenCalledTimes(1)
  })

  it('a discarded partial range does not leak into the next open', async () => {
    const onSelectRange = vi.fn()
    renderPicker(<DateRangePicker preset="last-7d" range={RANGE} onSelect={() => {}} onSelectRange={onSelectRange} />)
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

describe('DateRangePicker preset copy', () => {
  it('renders the zh-CN preset chips and the range aria label', () => {
    renderPicker(<DateRangePicker preset="last-7d" range={RANGE} onSelect={() => {}} onSelectRange={() => {}} />)
    expect(screen.getByLabelText('时间范围')).toBeTruthy()
    for (const label of ['最近 1 小时', '今天', '昨天', '最近 7 天', '最近 30 天', '最近 90 天', '最近 365 天']) {
      expect(screen.getByRole('button', { name: label })).toBeTruthy()
    }
  })

  it('renders the en-US preset chips and the range aria label', () => {
    render(
      wrapWithI18n(<DateRangePicker preset="last-7d" range={RANGE} onSelect={() => {}} onSelectRange={() => {}} />, {
        locale: 'en-US',
      }),
    )
    expect(screen.getByLabelText('Date range')).toBeTruthy()
    for (const label of [
      'Last hour',
      'Today',
      'Yesterday',
      'Last 7 days',
      'Last 30 days',
      'Last 90 days',
      'Last 365 days',
    ]) {
      expect(screen.getByRole('button', { name: label })).toBeTruthy()
    }
  })
})
