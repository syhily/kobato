import type { ReactNode } from 'react'

import { describe, expect, it } from 'vitest'

import type { CountersDto, MetricRow } from '@/shared/contracts/analytics'

import { makeAnalyticsState } from '#/_helpers/analytics-state'
import { renderInRouter, renderToHtml, stableHtml } from '#/_helpers/render'
import { AnalyticsStateProvider } from '@/ui/admin/analytics/analytics-state-context'
import { Counters } from '@/ui/admin/analytics/Counters'
import { DateRangePicker } from '@/ui/admin/analytics/DateRangePicker'
import { FiltersBar } from '@/ui/admin/analytics/Filters'
import { Heatmap } from '@/ui/admin/analytics/Heatmap'
import { MetricList } from '@/ui/admin/analytics/MetricList'
import { MetricName } from '@/ui/admin/analytics/MetricName'
import { MetricsGroup } from '@/ui/admin/analytics/MetricsGroup'
import { ViewsChart } from '@/ui/admin/analytics/ViewsChart'

// Fixtures mirror the wire DTOs exactly so a contract change fails loudly.
// Panels no longer read the URL themselves — wrap them in the provider with
// the deterministic stub state, as the route module would.

function withAnalyticsState(node: ReactNode): ReactNode {
  return <AnalyticsStateProvider state={makeAnalyticsState()}>{node}</AnalyticsStateProvider>
}

const METRIC_ROWS: MetricRow[] = [
  { name: 'CN', visits: 100, visitors: 60 },
  { name: 'US', visits: 40, visitors: 25 },
  { name: 'JP', visits: 8, visitors: 5 },
]

describe('snapshot: ViewsChart', () => {
  it('renders the static chart skeleton during SSR (the @unovis chart is client-only)', () => {
    const html = stableHtml(renderInRouter(withAnalyticsState(<ViewsChart />), '/admin/analytics'))
    // Hydration-safe gate: SSR emits the identical pre-mount skeleton; no
    // loader payload is painted (it would be Etc/UTC-bucketed), the
    // client-timezone-aware query owns the first chart paint.
    expect(html).toContain('role="status"')
    expect(html).toContain('aria-busy="true"')
    expect(html).toContain('加载中')
    // No chart markup on the server.
    expect(html).not.toContain('vis-xy-container')
  })
})

describe('snapshot: Heatmap', () => {
  it('renders the skeleton during SSR — the UTC-bucketed loader cells never paint', () => {
    const html = stableHtml(renderInRouter(withAnalyticsState(<Heatmap metric="visits" />), '/admin/analytics'))
    // The client-timezone-aware query owns the first grid paint.
    expect(html).toContain('role="status"')
    expect(html).toContain('aria-busy="true"')
    expect(html).toContain('加载中')
    expect(html).not.toContain('role="grid"')
  })
})

describe('snapshot: Counters', () => {
  it('renders the three KPI cards with icons and values', () => {
    const data: CountersDto = { visits: 1234, visitors: 567, referers: 89 }
    const html = stableHtml(renderInRouter(withAnalyticsState(<Counters initial={data} />), '/admin/analytics'))
    expect(html).toContain('访问量')
    expect(html).toContain('访客数')
    expect(html).toContain('来源域名')
    // @number-flow/react renders a web component with locale-formatted aria-label.
    expect(html).toContain('aria-label="1,234"')
    expect(html).toContain('aria-label="567"')
    expect(html).toContain('aria-label="89"')
  })

  it('renders skeleton placeholders when no data is available yet', () => {
    const html = stableHtml(renderInRouter(withAnalyticsState(<Counters initial={null} />), '/admin/analytics'))
    expect(html).toContain('访问量')
    expect(html).toContain('aria-busy')
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
        <FiltersBar filters={{ country: 'CN', browser: 'Chrome' }} onClear={() => {}} onClearAll={() => {}} />,
      ),
    )
    expect(html).toContain('国家')
    expect(html).toContain('CN')
    expect(html).toContain('浏览器')
    expect(html).toContain('Chrome')
    expect(html).toContain('清空筛选')
    expect(html).toContain('aria-label="已应用的筛选"')
  })
})

describe('snapshot: DateRangePicker', () => {
  const RANGE = { startAt: 1705276800, endAt: 1705363200 } // 2024-01-15 → 2024-01-16 UTC

  it('renders the seven preset chips plus the custom-range chip', () => {
    const html = stableHtml(
      renderToHtml(<DateRangePicker preset="last-7d" range={RANGE} onSelect={() => {}} onSelectRange={() => {}} />),
    )
    expect(html).toContain('aria-pressed="true"')
    expect(html).toContain('最近 7 天')
    expect(html).toContain('今天')
    expect(html).toContain('最近 365 天')
    expect(html).toContain('自定义')
  })

  it('shows the formatted range on the active custom chip when preset is null', () => {
    const html = stableHtml(
      renderToHtml(<DateRangePicker preset={null} range={RANGE} onSelect={() => {}} onSelectRange={() => {}} />),
    )
    // The custom chip is the only pressed one and carries the range label.
    expect((html.match(/aria-pressed="true"/g) ?? []).length).toBe(1)
    expect(html).not.toContain('>自定义<')
  })
})

describe('snapshot: MetricName', () => {
  it('renders a country row with the flag emoji and the zh-CN region name', () => {
    const html = stableHtml(renderToHtml(<MetricName name="CN" type="country" />))
    expect(html).toContain('🇨🇳')
    expect(html).toContain('中国')
  })

  it('renders a referer row with the local letter avatar (no external favicon request)', () => {
    const html = stableHtml(renderToHtml(<MetricName name="google.com" type="referer" />))
    expect(html).not.toContain('<img')
    expect(html).not.toContain('unavatar')
    expect(html).toContain('google.com')
    expect(html).toContain('>g</span>')
  })

  it('renders a path row as monospace text', () => {
    const html = stableHtml(renderToHtml(<MetricName name="/posts/hello" type="path" />))
    expect(html).toContain('font-mono')
    expect(html).toContain('/posts/hello')
  })

  it('renders an os row with a brand icon', () => {
    const html = stableHtml(renderToHtml(<MetricName name="macOS" type="os" />))
    expect(html).toContain('macOS')
    expect(html).toContain('<svg')
  })

  it('renders 直接访问 for an empty referer name', () => {
    const html = stableHtml(renderToHtml(<MetricName name="" type="referer" />))
    expect(html).toContain('直接访问')
  })
})

describe('snapshot: MetricList', () => {
  it('renders rows from initial data without waiting on the pending query', () => {
    const html = stableHtml(
      renderInRouter(
        withAnalyticsState(<MetricList type="country" title="国家" initial={METRIC_ROWS} />),
        '/admin/analytics',
      ),
    )
    expect(html).toContain('中国')
    expect(html).toContain('美国')
    expect(html).toContain('日本')
    // Counts are toLocaleString-formatted; percent shares appear next to them.
    expect(html).toContain('100')
    expect(html).toContain('(67%)')
    // The details-dialog trigger sits in the footer.
    expect(html).toContain('详情')
  })

  it('renders the empty-state branch when initial is an empty array', () => {
    const html = stableHtml(
      renderInRouter(withAnalyticsState(<MetricList type="os" title="操作系统" initial={[]} />), '/admin/analytics'),
    )
    expect(html).toContain('暂无数据')
  })
})

describe('snapshot: MetricsGroup', () => {
  it('renders the tabbed group card with the first tab active', () => {
    const html = stableHtml(
      renderInRouter(
        withAnalyticsState(<MetricsGroup group="location" initial={{ country: METRIC_ROWS }} />),
        '/admin/analytics',
      ),
    )
    // Tabs from METRIC_GROUP_TABS.location.
    expect(html).toContain('国家')
    expect(html).toContain('地区')
    expect(html).toContain('城市')
    // The active tab's MetricList renders the initial rows.
    expect(html).toContain('中国')
  })
})
