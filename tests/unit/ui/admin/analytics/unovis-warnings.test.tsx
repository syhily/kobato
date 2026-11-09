// @vitest-environment happy-dom

import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { wrapWithI18n } from '#/_helpers/i18n-render'

const captured = vi.hoisted(() => ({
  crosshairY: undefined as unknown,
  mapAreas: undefined as unknown,
}))

vi.mock('@unovis/react', () => ({
  VisArea: () => null,
  VisAxis: () => null,
  VisCrosshair: (props: { y?: unknown }) => {
    captured.crosshairY = props.y
    return null
  },
  VisGroupedBar: () => null,
  VisLine: () => null,
  VisTooltip: () => null,
  VisXYContainer: ({ children }: { children: React.ReactNode }) => children,
  VisSingleContainer: ({ children, data }: { children: React.ReactNode; data: { areas: unknown } }) => {
    captured.mapAreas = data.areas
    return children
  },
  VisTopoJSONMap: () => null,
  VisTopoJSONMapSelectors: { feature: 'feature' },
}))

import { LocationsMapInner } from '@/ui/admin/analytics/LocationsMapInner'
import { ViewsChartInner } from '@/ui/admin/analytics/ViewsChartInner'

describe('Unovis configuration warnings', () => {
  it('configures chart crosshair accessors and only passes known map areas', () => {
    render(
      wrapWithI18n(
        <>
          <ViewsChartInner
            points={[
              { time: '2026-11-08', visits: 2, visitors: 1 },
              { time: '2026-11-09', visits: 3, visitors: 2 },
            ]}
            unit="day"
          />
          <LocationsMapInner
            rows={[
              { name: 'CN', visits: 2, visitors: 1 },
              { name: 'GP', visits: 1, visitors: 1 },
              { name: 'PS', visits: 1, visitors: 1 },
            ]}
          />
        </>,
      ),
    )

    expect(Array.isArray(captured.crosshairY)).toBe(true)
    expect(captured.mapAreas).toEqual([{ id: 'CN', count: 2 }])
  })
})
