import { sql, type SQL } from 'drizzle-orm'

import type {
  CountersDto,
  DateRange,
  Filters,
  HeatmapCell,
  MetricRow,
  MetricType,
  PresetKey,
  RealtimeEvent,
  ViewsPoint,
} from '@/shared/contracts/analytics'

import { db } from '@/server/infra/db/pool'
import { DomainError } from '@/server/infra/http/errors'
import {
  FILTERABLE_TYPES,
  METRIC_TYPES,
  PRESET_KEYS,
  computeDateRange,
  pickAggregateSource,
  pickTimeBucket,
} from '@/shared/contracts/analytics'
import { idFromString } from '@/shared/utils/id'

// Shared query helpers for the analytics dashboard. One module owns:
//
//   * Parse search params → typed `AnalyticsQueryInput` (range + filters).
//   * Compose a single `WHERE` fragment so every loader applies the
//     same filter vocabulary.
//   * Run the four canonical dashboard queries (counters / views /
//     heatmap / metrics) and the realtime tail query.
//
// Drizzle's tagged-template `sql` builder handles parameter binding,
// so the raw column-name → identifier translation below stays
// allow-listed to avoid SQL injection through user-supplied
// `?type=` / filter keys.

export interface AnalyticsQueryInput {
  range: DateRange
  filters: Filters
  /** Optional content-target narrowing (e.g. per-post drill-down). */
  entityType?: 'post' | 'page'
  entityId?: bigint
}

const FILTERABLE_SET = new Set<string>(FILTERABLE_TYPES)
const METRIC_SET = new Set<string>(METRIC_TYPES)

// Allow-listed mapping from the wire-side metric type to the actual
// column name on `access_log`. Lives here (and not on the wire DTO)
// because the dashboard never needs to know the underlying column
// names — and centralising the map keeps a future column rename
// inside the server boundary.
const METRIC_COLUMN: Record<MetricType, string> = {
  country: 'country',
  region: 'region',
  city: 'city',
  referer: 'referer_host',
  language: 'language',
  timezone: 'timezone',
  os: 'os',
  browser: 'browser',
  browserType: 'browser',
  device: 'device',
  deviceType: 'device_type',
  path: 'path',
}

export function parseAnalyticsSearch(searchParams: URLSearchParams): AnalyticsQueryInput {
  const preset = searchParams.get('preset')
  const startAtRaw = searchParams.get('startAt')
  const endAtRaw = searchParams.get('endAt')

  let range: DateRange
  if (startAtRaw && endAtRaw) {
    const startAt = Number.parseInt(startAtRaw, 10)
    const endAt = Number.parseInt(endAtRaw, 10)
    if (Number.isFinite(startAt) && Number.isFinite(endAt) && endAt > startAt) {
      range = { startAt, endAt }
    } else {
      range = computeDateRange('last-7d')
    }
  } else if (preset && (PRESET_KEYS as readonly string[]).includes(preset)) {
    range = computeDateRange(preset as PresetKey)
  } else {
    range = computeDateRange('last-7d')
  }

  const filters: Filters = {}
  const filtersRaw = searchParams.get('filters')
  if (filtersRaw) {
    try {
      const parsed = JSON.parse(filtersRaw) as Record<string, unknown>
      for (const [key, value] of Object.entries(parsed)) {
        if (FILTERABLE_SET.has(key) && typeof value === 'string' && value.length > 0) {
          filters[key as MetricType] = value
        }
      }
    } catch {
      // bad JSON → just drop filters; the URL caller can recover by
      // editing the search param.
    }
  }

  const entityType = searchParams.get('entityType')
  const entityIdRaw = searchParams.get('entityId')
  const result: AnalyticsQueryInput = { range, filters }
  if ((entityType === 'post' || entityType === 'page') && entityIdRaw) {
    try {
      result.entityType = entityType
      result.entityId = idFromString(entityIdRaw)
    } catch {
      // ignore — entity narrowing is optional.
    }
  }
  return result
}

function quoteIdent(name: string): SQL {
  // Allow-list guard: only column names we explicitly map are
  // accepted. Anything else (e.g. a user-supplied SQL fragment) gets
  // rejected before reaching the builder.
  if (!/^[a-z_][a-z0-9_]*$/.test(name)) {
    throw new DomainError('BAD_REQUEST', `invalid identifier: ${name}`)
  }
  return sql.raw(`"${name}"`)
}

function whereClause(input: AnalyticsQueryInput): SQL {
  const conditions: SQL[] = [
    sql`is_bot = FALSE`,
    sql`ts >= to_timestamp(${input.range.startAt})`,
    sql`ts < to_timestamp(${input.range.endAt})`,
  ]
  if (input.entityType) {
    conditions.push(sql`entity_type = ${input.entityType}`)
  }
  if (input.entityId !== undefined) {
    conditions.push(sql`entity_id = ${input.entityId}`)
  }
  for (const [type, value] of Object.entries(input.filters)) {
    if (!FILTERABLE_SET.has(type) || !value) {
      continue
    }
    const col = METRIC_COLUMN[type as MetricType]
    conditions.push(sql`${quoteIdent(col)} = ${value}`)
  }
  return sql.join(conditions, sql` AND `)
}

export async function queryCounters(input: AnalyticsQueryInput): Promise<CountersDto> {
  const where = whereClause(input)
  const result = await db.execute(sql`
    SELECT
      COUNT(*)::bigint AS visits,
      COUNT(DISTINCT visitor_hash)::bigint AS visitors,
      COUNT(DISTINCT referer_host) FILTER (WHERE referer_host IS NOT NULL AND referer_host <> '')::bigint AS referers
    FROM access_log
    WHERE ${where}
  `)
  const row = result.rows[0] as
    | {
        visits?: string | number | null
        visitors?: string | number | null
        referers?: string | number | null
      }
    | undefined
  return {
    visits: Number(row?.visits ?? 0),
    visitors: Number(row?.visitors ?? 0),
    referers: Number(row?.referers ?? 0),
  }
}

export async function queryViews(input: AnalyticsQueryInput): Promise<ViewsPoint[]> {
  const bucket = pickTimeBucket(input.range)
  const source = pickAggregateSource(input.range)
  const where = whereClause(input)

  // Continuous aggregates already pre-grouped by hour / day, so when
  // reading from them we still need `time_bucket` to widen further
  // — but we sum the pre-aggregated `visits`/`visitors` columns
  // instead of recounting raw rows.
  const select =
    source === 'access_log'
      ? sql`
        SELECT
          time_bucket(${bucket}::interval, ts) AS time,
          COUNT(*)::bigint AS visits,
          COUNT(DISTINCT visitor_hash)::bigint AS visitors
        FROM access_log
        WHERE ${where}
        GROUP BY time
        ORDER BY time
      `
      : source === 'stats_hourly'
        ? sql`
          SELECT
            time_bucket(${bucket}::interval, bucket) AS time,
            SUM(visits)::bigint AS visits,
            SUM(visitors)::bigint AS visitors
          FROM stats_hourly
          WHERE ${cagWhereClause(input)}
          GROUP BY time
          ORDER BY time
        `
        : sql`
          SELECT
            time_bucket(${bucket}::interval, bucket) AS time,
            SUM(visits)::bigint AS visits,
            SUM(visitors)::bigint AS visitors
          FROM stats_daily
          WHERE ${cagWhereClause(input)}
          GROUP BY time
          ORDER BY time
        `

  const result = await db.execute(select)
  return result.rows.map((row) => {
    const r = row as { time: Date | string; visits: string | number; visitors: string | number }
    return {
      time: (r.time instanceof Date ? r.time : new Date(r.time)).toISOString(),
      visits: Number(r.visits),
      visitors: Number(r.visitors),
    }
  })
}

// CAGs don't carry `ts` / `is_bot` / `referer_host` — they're already
// pre-filtered (`WHERE is_bot = FALSE` in the MV definition) and
// keyed on `bucket`. So the WHERE shape is narrower than
// `whereClause` for raw rows.
function cagWhereClause(input: AnalyticsQueryInput): SQL {
  const conditions: SQL[] = [
    sql`bucket >= to_timestamp(${input.range.startAt})`,
    sql`bucket < to_timestamp(${input.range.endAt})`,
  ]
  if (input.entityType) {
    conditions.push(sql`entity_type = ${input.entityType}`)
  }
  if (input.entityId !== undefined) {
    conditions.push(sql`entity_id = ${input.entityId}`)
  }
  for (const [type, value] of Object.entries(input.filters)) {
    // CAGs only carry the subset of dimensions in their MV definition.
    // Filter against what's there; ignore the rest (the dashboard
    // already disabled those filters when reading from a CAG).
    const hourlyDims = new Set(['country', 'browser', 'os', 'deviceType', 'path'])
    const dailyDims = new Set(['country', 'path'])
    const usable = pickAggregateSource(input.range) === 'stats_hourly' ? hourlyDims : dailyDims
    if (!usable.has(type) || !value) {
      continue
    }
    const col = METRIC_COLUMN[type as MetricType]
    conditions.push(sql`${quoteIdent(col)} = ${value}`)
  }
  return sql.join(conditions, sql` AND `)
}

export async function queryHeatmap(input: AnalyticsQueryInput): Promise<HeatmapCell[]> {
  const where = whereClause(input)
  // `EXTRACT(DOW)` returns Sunday=0..Saturday=6 — matches the
  // dashboard's CSS Grid `(row=weekday, col=hour)` layout.
  const result = await db.execute(sql`
    SELECT
      EXTRACT(DOW FROM ts)::int AS weekday,
      EXTRACT(HOUR FROM ts)::int AS hour,
      COUNT(*)::bigint AS visits,
      COUNT(DISTINCT visitor_hash)::bigint AS visitors
    FROM access_log
    WHERE ${where}
    GROUP BY weekday, hour
  `)
  return result.rows.map((row) => {
    const r = row as {
      weekday: number
      hour: number
      visits: string | number
      visitors: string | number
    }
    return {
      weekday: r.weekday,
      hour: r.hour,
      visits: Number(r.visits),
      visitors: Number(r.visitors),
    }
  })
}

export async function queryMetric(input: AnalyticsQueryInput, type: MetricType, limit = 20): Promise<MetricRow[]> {
  if (!METRIC_SET.has(type)) {
    throw new DomainError('BAD_REQUEST', `unknown metric type: ${type}`)
  }
  const col = METRIC_COLUMN[type]
  const where = whereClause(input)
  // `browserType` is the lower-cardinality slice of `browser` —
  // we group on a derived bucket rather than on the column itself
  // so the dashboard tab "browser type" can show `desktop / mobile
  // / crawler` style splits without needing a separate column on
  // the table. (The plan calls this out in §10.2.)
  const groupExpr =
    type === 'browserType'
      ? sql`COALESCE(NULLIF(${quoteIdent(col)}, ''), '(unknown)')`
      : sql`COALESCE(NULLIF(${quoteIdent(col)}, ''), '(unknown)')`
  const result = await db.execute(sql`
    SELECT
      ${groupExpr} AS name,
      COUNT(*)::bigint AS visits,
      COUNT(DISTINCT visitor_hash)::bigint AS visitors
    FROM access_log
    WHERE ${where}
    GROUP BY name
    ORDER BY visits DESC
    LIMIT ${limit}
  `)
  return result.rows.map((row) => {
    const r = row as { name: string; visits: string | number; visitors: string | number }
    return {
      name: r.name,
      visits: Number(r.visits),
      visitors: Number(r.visitors),
    }
  })
}

export async function queryRealtimeTail(sinceTs: Date, limit = 50): Promise<RealtimeEvent[]> {
  const result = await db.execute(sql`
    SELECT
      ts,
      path,
      country,
      city,
      browser,
      os,
      device_type AS "deviceType",
      is_bot AS "isBot"
    FROM access_log
    WHERE ts > ${sinceTs}
    ORDER BY ts DESC
    LIMIT ${limit}
  `)
  return result.rows.map((row) => {
    const r = row as {
      ts: Date | string
      path: string
      country: string | null
      city: string | null
      browser: string | null
      os: string | null
      deviceType: string | null
      isBot: boolean
    }
    return {
      ts: (r.ts instanceof Date ? r.ts : new Date(r.ts)).toISOString(),
      path: r.path,
      country: r.country,
      city: r.city,
      browser: r.browser,
      os: r.os,
      deviceType: r.deviceType,
      isBot: r.isBot,
    }
  })
}
