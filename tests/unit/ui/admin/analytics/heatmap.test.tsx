// @vitest-environment happy-dom

import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

import type { HeatmapCell } from '@/shared/contracts/analytics'

import { makeAnalyticsState } from '#/_helpers/analytics-state'
import { mockTanstackQuery } from '#/_helpers/mock-react-query'
import { AnalyticsStateProvider } from '@/ui/admin/analytics/analytics-state-context'
import { Heatmap } from '@/ui/admin/analytics/Heatmap'

// Keyboard navigation contract for the 7×24 heatmap grid: roving tabindex
// with arrow-key movement (Slite's Heatmap.vue behavior). react-query is
// mocked so the component renders straight from the fixture cells; the URL
// state arrives via the provider, as the route module would supply it.

const control = mockTanstackQuery()

const CELLS: HeatmapCell[] = [
  { weekday: 1, hour: 0, visits: 5, visitors: 2 },
  { weekday: 1, hour: 1, visits: 9, visitors: 4 },
  { weekday: 2, hour: 0, visits: 3, visitors: 1 },
]

function renderHeatmap() {
  return render(
    <AnalyticsStateProvider state={makeAnalyticsState()}>
      <Heatmap metric="visits" />
    </AnalyticsStateProvider>,
  )
}

describe('ui/admin/analytics/Heatmap keyboard navigation', () => {
  beforeEach(() => {
    control.query.data = CELLS
    control.query.isFetching = false
    control.query.isError = false
  })

  it('renders a grid with exactly one tab stop (roving tabindex)', () => {
    renderHeatmap()
    const cells = screen.getAllByRole('gridcell').map((cell) => cell.querySelector('button')!)
    expect(cells.length).toBe(7 * 24)
    const tabStops = cells.filter((button) => button.tabIndex === 0)
    expect(tabStops.length).toBe(1)
    expect(cells[0]).toBe(tabStops[0])
  })

  it('arrow keys move focus within and across rows', () => {
    renderHeatmap()
    const grid = screen.getByRole('grid')
    const buttons = Array.from(grid.querySelectorAll('button'))

    buttons[0]!.focus()
    expect(document.activeElement).toBe(buttons[0])

    // ArrowRight → same row, next hour.
    fireEvent.keyDown(buttons[0]!, { key: 'ArrowRight' })
    expect(document.activeElement).toBe(buttons[1])
    expect(buttons[1]!.tabIndex).toBe(0)
    expect(buttons[0]!.tabIndex).toBe(-1)

    // ArrowDown → next weekday row, same hour.
    fireEvent.keyDown(buttons[1]!, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(buttons[1 + 24])

    // ArrowUp → back to the first row.
    fireEvent.keyDown(buttons[1 + 24]!, { key: 'ArrowUp' })
    expect(document.activeElement).toBe(buttons[1])

    // ArrowLeft at the row start stays put.
    fireEvent.keyDown(buttons[0]!, { key: 'ArrowLeft' })
    expect(document.activeElement).toBe(buttons[0])
  })

  it('clamps movement at the grid edges', () => {
    renderHeatmap()
    const grid = screen.getByRole('grid')
    const buttons = Array.from(grid.querySelectorAll('button'))

    buttons[0]!.focus()
    fireEvent.keyDown(buttons[0]!, { key: 'ArrowUp' })
    expect(document.activeElement).toBe(buttons[0])

    const last = buttons[7 * 24 - 1]!
    last.focus()
    fireEvent.keyDown(last, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(last)
    fireEvent.keyDown(last, { key: 'ArrowRight' })
    expect(document.activeElement).toBe(last)
  })
})
