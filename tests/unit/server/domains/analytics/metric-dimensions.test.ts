import { describe, expect, it } from 'vitest'

import {
  compileAnalyticsQuery,
  createAnalyticsQuery,
  createEnvMetricQuery,
} from '@/server/domains/analytics/services/analytics-sql'
import { METRIC_DIMENSIONS, dimensionWhere } from '@/server/domains/analytics/services/metric-dimensions'
import { METRIC_TYPES } from '@/shared/contracts/analytics'

// The dimension registry is the single owner of each metric's display and
// filter expressions: one entry per MetricType (a new type cannot compile
// without one), and user values always bind as parameters.

const ENV_DIMENSIONS = ['screen', 'viewport', 'dpr', 'touch', 'colorScheme', 'netEffectiveType']

function envDimensionSql(type: 'dpr' | 'touch'): string {
  const dimension = METRIC_DIMENSIONS[type]
  if (dimension.source !== 'env') {
    throw new Error(`${type} is not an env dimension`)
  }
  return compileAnalyticsQuery(createEnvMetricQuery().select([dimension.select.as('bucket')])).sql
}

describe('METRIC_DIMENSIONS registry', () => {
  it('has exactly one definition per metric type', () => {
    expect(Object.keys(METRIC_DIMENSIONS).sort()).toEqual([...METRIC_TYPES].sort())
  })

  it('classifies blob dimensions and environment dimensions explicitly', () => {
    const env = METRIC_TYPES.filter((type) => METRIC_DIMENSIONS[type].source === 'env')
    expect([...env].sort()).toEqual([...ENV_DIMENSIONS].sort())

    for (const type of METRIC_TYPES) {
      const dimension = METRIC_DIMENSIONS[type]
      if (dimension.source === 'events') {
        expect(dimension.column).toMatch(/^blob\d+$/)
      } else {
        expect(dimension.select).toBeDefined()
      }
    }
  })

  it('binds the environment filter values instead of inlining them', () => {
    const compiled = compileAnalyticsQuery(
      createAnalyticsQuery()
        .select(['blob1'])
        .where(dimensionWhere(METRIC_DIMENSIONS.viewport, ['≤480', '≤768'])),
    )

    expect(compiled.sql).toContain('device_env_client')
    // The bucket tokens are server-owned CASE literals; the filter values bind.
    expect(compiled.sql).toMatch(/in \(\?, \?\)/)
    expect(compiled.parameters).toEqual(['≤480', '≤768'])
  })

  it('emits locale-neutral bucket tokens (the UI owns their labels)', () => {
    const dpr = envDimensionSql('dpr')
    expect(dpr).toContain("'other'")
    expect(dpr).not.toMatch(/[\u4e00-\u9fff]/)

    const touch = envDimensionSql('touch')
    for (const token of ["'none'", "'1-5'", "'6-10'", "'many'"]) {
      expect(touch).toContain(token)
    }
    expect(touch).not.toMatch(/[\u4e00-\u9fff]/)
  })

  it('targets the blob column for a blob dimension filter', () => {
    const compiled = compileAnalyticsQuery(
      createAnalyticsQuery()
        .select(['blob1'])
        .where(dimensionWhere(METRIC_DIMENSIONS.country, ['US'])),
    )

    expect(compiled.sql).toContain('access_events.blob7 in (')
    expect(compiled.parameters).toEqual(['US'])
  })
})
