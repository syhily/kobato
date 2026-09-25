// @vitest-environment happy-dom

import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it } from 'vitest'

import type { ViewsDto } from '@/shared/contracts/analytics'

import { mockTanstackQuery } from '#/_helpers/mock-react-query'
import { VisitSummaryCard } from '@/ui/admin/welcome/VisitSummaryCard'

// Post-hydration VisitSummaryCard trend behavior: react-query is mocked so
// the client-timezone-aware query resolves straight from the fixture DTO.
// The SSR skeleton branch is covered by the welcome snapshot tests.

const control = mockTanstackQuery()

const SUMMARY = { visits: 0, visitors: 0, referers: 0 }

function renderCard(points: ViewsDto['points']) {
  return render(
    <MemoryRouter initialEntries={['/admin']}>
      <VisitSummaryCard summary={SUMMARY} weeklyTrend={{ unit: 'day', clientTimezone: 'Etc/UTC', points }} />
    </MemoryRouter>,
  )
}

describe('ui/admin/welcome/VisitSummaryCard trend block', () => {
  beforeEach(() => {
    control.query.data = null
    control.query.isFetching = false
    control.query.isError = false
  })

  it('aggregates the client query points into the 7-day trend block', () => {
    control.query.data = {
      unit: 'day',
      clientTimezone: 'Asia/Shanghai',
      points: [
        { time: '2024-01-10', visits: 10, visitors: 5 },
        { time: '2024-01-11', visits: 20, visitors: 8 },
      ],
    } satisfies ViewsDto
    renderCard([])
    expect(screen.getByText('最近 7 天趋势')).toBeTruthy()
    expect(screen.getByText('总访问')).toBeTruthy()
    expect(screen.getByText('30')).toBeTruthy()
  })

  it('emits a valid sparkline path when the trend aggregates to a single day', () => {
    control.query.data = {
      unit: 'hour',
      clientTimezone: 'Asia/Shanghai',
      points: [
        // Hour-unit labels still aggregate onto the same day key.
        { time: '2024-01-10 02', visits: 10, visitors: 5 },
        { time: '2024-01-10 08', visits: 20, visitors: 8 },
      ],
    } satisfies ViewsDto
    const { container } = renderCard([])
    const paths = Array.from(container.querySelectorAll('path'))
    expect(paths.length).toBeGreaterThan(0)
    for (const path of paths) {
      const d = path.getAttribute('d') ?? ''
      expect(d).not.toMatch(/\bL\s*L\b/)
      expect(d).not.toMatch(/\bL\s*$/)
    }
  })

  it('keeps the skeleton until the client query resolves', () => {
    renderCard([{ time: '2024-01-10', visits: 10, visitors: 5 }])
    expect(screen.getByText('加载中')).toBeTruthy()
    expect(screen.queryByText('最近 7 天趋势')).toBeNull()
  })
})
