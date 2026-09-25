import { VisSingleContainer, VisTooltip, VisTopoJSONMap, VisTopoJSONMapSelectors } from '@unovis/react'
import { WorldMapTopoJSON } from '@unovis/ts/maps.js'
import { useId, useMemo } from 'react'

import type { MetricRow } from '@/shared/contracts/analytics'

import { escapeHtml } from '@/shared/utils/security'
import { unsafeCast } from '@/shared/utils/unsafe-cast'
import { regionDisplayName } from '@/ui/admin/analytics/MetricName'

// The @unovis choropleth — CLIENT ONLY. Lazy-loaded behind the hydration
// gate in `LocationsMap.tsx`; WorldMapTopoJSON rides this chunk.

interface AreaDatum {
  id: string
  count: number
}

const COLOR_AREA = 'var(--color-chart-1)'

export interface LocationsMapInnerProps {
  rows: MetricRow[]
}

export function LocationsMapInner({ rows }: LocationsMapInnerProps) {
  const summaryId = `locations-summary-${useId()}`

  const areas = useMemo<AreaDatum[]>(
    () =>
      rows
        .filter((row) => /^[A-Za-z]{2}$/.test(row.name))
        .map((row) => ({ id: row.name.toUpperCase(), count: row.visits })),
    [rows],
  )
  const maxCount = areas.reduce((max, area) => Math.max(max, area.count), 0)
  const totalVisits = areas.reduce((sum, area) => sum + area.count, 0)
  const topAreas = [...areas].sort((a, b) => b.count - a.count).slice(0, 5)

  // Choropleth: chart-1 intensity scaled by share of the maximum.
  const areaColor = (area: AreaDatum) => {
    if (!area || maxCount === 0 || !area.count) {
      return undefined
    }
    const alpha = Math.max(0.1, area.count / maxCount)
    return `color-mix(in srgb, ${COLOR_AREA} ${Math.round(alpha * 100)}%, transparent)`
  }

  // The tooltip template is raw HTML — escape every interpolated value.
  const tooltipTemplate = (datum: unknown) => {
    const wrapped = unsafeCast<{ data?: AreaDatum }>(datum).data
    const area = wrapped ?? unsafeCast<AreaDatum>(datum)
    if (!area?.id) {
      return ''
    }
    return `
      <div class="min-w-[120px] rounded-xl border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md">
        <div class="font-medium">${escapeHtml(regionDisplayName(area.id))}</div>
        <div class="mt-1 flex items-center gap-2">
          <span class="inline-block size-2 rounded-full" style="background: ${COLOR_AREA}"></span>
          <span class="text-muted-foreground">访问量</span>
          <span class="ml-auto pl-3 font-semibold tabular-nums">${escapeHtml(area.count.toLocaleString('zh-CN'))}</span>
        </div>
      </div>`
  }

  const summary = `地理位置分布: 共 ${areas.length} 个国家或地区,总访问量 ${totalVisits.toLocaleString('zh-CN')}。`

  return (
    <div className="absolute inset-0" role="img" aria-label={summary} aria-describedby={summaryId}>
      <VisSingleContainer data={{ areas }} style={{ height: '100%', width: '100%' }}>
        <VisTopoJSONMap topojson={WorldMapTopoJSON} mapFeatureName="countries" areaColor={areaColor} />
        <VisTooltip
          horizontalShift={20}
          verticalShift={20}
          triggers={{ [VisTopoJSONMapSelectors.feature]: tooltipTemplate }}
        />
      </VisSingleContainer>
      <div id={summaryId} className="sr-only">
        <p>{summary}</p>
        <ul>
          {topAreas.map((area) => (
            <li key={area.id}>
              {regionDisplayName(area.id)}: {area.count.toLocaleString('zh-CN')}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
