import type { CountersDto, HeatmapCell, MetricRow, ViewsPoint } from '@kobato/shared/contracts/analytics'

import { renderInRouter, renderToHtml, stableHtml } from '#/_helpers/render'

import { Counters } from '@kobato/ui/admin/analytics/Counters'
import { DateRangePicker } from '@kobato/ui/admin/analytics/DateRangePicker'
import { FiltersBar } from '@kobato/ui/admin/analytics/Filters'
import { Heatmap } from '@kobato/ui/admin/analytics/Heatmap'
import { MetricList } from '@kobato/ui/admin/analytics/MetricList'
import { MetricsGroup } from '@kobato/ui/admin/analytics/MetricsGroup'
import { ViewsChart } from '@kobato/ui/admin/analytics/ViewsChart'
import { describe, expect, it } from 'vitest'

// Fixtures mirror the analytics wire DTOs exactly so a contract change
// fails this suite loudly.

const VIEWS_DATA: ViewsPoint[] = [
  { time: '2024-01-15T00:00:00.000Z', visits: 10, visitors: 5 },
  { time: '2024-01-15T04:00:00.000Z', visits: 25, visitors: 12 },
  { time: '2024-01-15T08:00:00.000Z', visits: 40, visitors: 18 },
  { time: '2024-01-15T12:00:00.000Z', visits: 15, visitors: 9 },
]

const HEATMAP_DATA: HeatmapCell[] = [
  { weekday: 1, hour: 9, visits: 30, visitors: 10 },
  { weekday: 1, hour: 10, visits: 50, visitors: 20 },
  { weekday: 2, hour: 14, visits: 12, visitors: 6 },
]

const METRIC_ROWS: MetricRow[] = [
  { name: 'China', visits: 100, visitors: 60 },
  { name: 'United States', visits: 40, visitors: 25 },
  { name: 'Japan', visits: 8, visitors: 5 },
]

describe('snapshot: ViewsChart', () => {
  it('renders an SVG line chart with axes and legend for multi-point data', () => {
    const html = stableHtml(renderToHtml(<ViewsChart data={VIEWS_DATA} />))
    // SVG viewport + accessible label render for the chart surface.
    expect(html).toContain('<svg')
    expect(html).toContain('访问量与访客数折线图')
    // Two line paths (visits + visitors) and one area fill path.
    expect(html).toMatch(/<path[^>]*d="M/)
    // Legend below the chart names both series.
    expect(html).toContain('访问量')
    expect(html).toContain('访客数')
  })

  it('renders the single-point branch as two stat bars', () => {
    // A lone data point cannot draw a line — the component switches to
    // a pair of big-number bars instead.
    const html = stableHtml(
      renderToHtml(<ViewsChart data={[{ time: '2024-01-15T00:00:00.000Z', visits: 7, visitors: 3 }]} />),
    )
    expect(html).toContain('访问量')
    expect(html).toContain('访客数')
    expect(html).toContain('7')
    expect(html).toContain('3')
    // No SVG in the single-point branch.
    expect(html).not.toContain('<svg')
  })

  it('renders the empty-state branch for an empty data array', () => {
    const html = stableHtml(renderToHtml(<ViewsChart data={[]} />))
    expect(html).toContain('当前时间范围内暂无数据')
    // No SVG / chart surface in the empty branch.
    expect(html).not.toContain('<svg')
  })

  it('honours a custom height prop by adjusting the viewBox', () => {
    const html = stableHtml(renderToHtml(<ViewsChart data={VIEWS_DATA} height={300} />))
    // viewBox width is fixed at 800; the custom height flows into the
    // viewBox's height component.
    expect(html).toMatch(/viewBox="0 0 800 300"/)
  })
})

describe('snapshot: Heatmap', () => {
  it('renders the 7×24 grid with hour axis labels', () => {
    const html = stableHtml(renderToHtml(<Heatmap data={HEATMAP_DATA} />))
    // The heatmap surface is an img-role region with the aria-label.
    expect(html).toContain('aria-label="7 天 24 小时访问热力图"')
    // Hour axis labels render at the bottom of the grid.
    expect(html).toContain('0:00')
    expect(html).toContain('12:00')
    expect(html).toContain('23:00')
    // Weekday labels run down the left rail.
    expect(html).toContain('一')
  })

  it('renders the empty-state branch when all cells are zero', () => {
    const html = stableHtml(renderToHtml(<Heatmap data={[]} />))
    expect(html).toContain('当前时间范围内暂无数据')
    expect(html).not.toContain('aria-label="7 天 24 小时访问热力图"')
  })
})

describe('snapshot: Counters', () => {
  it('renders the three KPI cards with values', () => {
    const data: CountersDto = { visits: 1234, visitors: 567, referers: 89 }
    const html = stableHtml(renderToHtml(<Counters data={data} />))
    expect(html).toContain('访问量')
    expect(html).toContain('访客数')
    expect(html).toContain('来源域名')
    // @number-flow/react renders a web component with locale-formatted aria-label.
    expect(html).toContain('aria-label="1,234"')
    expect(html).toContain('aria-label="567"')
    expect(html).toContain('aria-label="89"')
  })

  it('renders skeleton placeholders when data is null', () => {
    const html = stableHtml(renderToHtml(<Counters data={null} />))
    expect(html).toContain('访问量')
    expect(html).toContain('访客数')
    expect(html).toContain('来源域名')
    // The loading branch emits an aria-hidden pulse placeholder.
    expect(html).toContain('aria-hidden')
    expect(html).toContain('animate-pulse')
  })
})

describe('snapshot: FiltersBar', () => {
  it('renders nothing when no filters are active', () => {
    const html = stableHtml(renderToHtml(<FiltersBar filters={{}} onClear={() => {}} onClearAll={() => {}} />))
    expect(html).toBe('')
  })

  it('renders active filter badges plus the clear-all button', () => {
    const html = stableHtml(
      renderToHtml(
        <FiltersBar filters={{ country: 'China', browser: 'Chrome' }} onClear={() => {}} onClearAll={() => {}} />,
      ),
    )
    // Filter type labels come from the local TYPE_LABEL map.
    expect(html).toContain('国家')
    expect(html).toContain('China')
    expect(html).toContain('浏览器')
    expect(html).toContain('Chrome')
    // Clear-all affordance.
    expect(html).toContain('清空筛选')
    expect(html).toContain('aria-label="已应用的筛选"')
  })
})

describe('snapshot: DateRangePicker', () => {
  it('renders the seven preset chips', () => {
    const html = stableHtml(renderToHtml(<DateRangePicker preset="last-7d" onSelect={() => {}} />))
    // The active preset renders with aria-pressed so the chip's state
    // is exposed to AT users.
    expect(html).toContain('aria-pressed="true"')
    expect(html).toContain('最近 7 天')
    // A non-active preset chip is also present.
    expect(html).toContain('今天')
    expect(html).toContain('最近 365 天')
  })

  it('renders no active chip when preset is null', () => {
    const html = stableHtml(renderToHtml(<DateRangePicker preset={null} onSelect={() => {}} />))
    expect(html).not.toContain('aria-pressed="true"')
  })
})

describe('snapshot: MetricList', () => {
  it('renders rows from initial data without waiting on the pending query', () => {
    // MetricList drives its data via useQuery, but when `initial` is
    // provided it renders synchronously off the fixture regardless of
    // the pending fetch. useAnalyticsState needs a router context, so
    // we render inside the memory router.
    const html = stableHtml(renderInRouter(<MetricList type="country" initial={METRIC_ROWS} />, '/admin/analytics'))
    expect(html).toContain('China')
    expect(html).toContain('United States')
    expect(html).toContain('Japan')
    // Visit counts are formatted with toLocaleString (no thousands
    // separator in the default node locale for small numbers, but the
    // raw value must appear).
    expect(html).toContain('100')
    expect(html).toContain('40')
  })

  it('renders the empty-state branch when initial is an empty array', () => {
    const html = stableHtml(renderInRouter(<MetricList type="os" initial={[]} />, '/admin/analytics'))
    expect(html).toContain('暂无数据')
  })
})

describe('snapshot: MetricsGroup', () => {
  it('renders the group card with metric-type tabs', () => {
    const html = stableHtml(
      renderInRouter(<MetricsGroup group="location" initial={{ country: METRIC_ROWS }} />, '/admin/analytics'),
    )
    // Group title from GROUP_LABEL.
    expect(html).toContain('位置')
    // Tabs from METRIC_GROUP_TABS.location.
    expect(html).toContain('国家')
    expect(html).toContain('地区')
    expect(html).toContain('城市')
    // The active tab's MetricList renders the initial rows.
    expect(html).toContain('China')
  })
})
