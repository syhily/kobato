import type { BlobName } from '@kobato/db/duckdb/access-events.ts'
import type { MetricType } from '@kobato/db/duckdb/queries/types.ts'
import type { RawBuilder } from 'kysely'

import { blobColumns } from '@kobato/db/duckdb/access-events.ts'
import { sql } from 'kysely'

/**
 * The metric dimension registry: every dimension owns BOTH its display
 * expression (SELECT / GROUP BY) and the predicate used to filter by a displayed
 * value (WHERE) — the filter reuses the display expression, so a clicked row's
 * label round-trips exactly. `events` dimensions read `access_events` through
 * the semantic blob-slot contract (`blobColumns`): a name must be a declared
 * slot, so a typo or a re-allocation fails at compile time — never a silently
 * wrong `blob7`. `env` dimensions read `device_env_client`, which the metric
 * query INNER JOINs. Every SQL fragment here is application-owned; user values
 * travel as bound parameters.
 */

export interface EventsDimension {
  source: 'events'
  column: string
}

export interface EnvDimension {
  source: 'env'
  /** Display expression — also the GROUP BY key and the filter's left side. */
  select: RawBuilder<unknown>
  /** Extra rows the bucket requires (e.g. static block present). */
  require?: RawBuilder<boolean>
}

export type MetricDimension = EventsDimension | EnvDimension

const env = (column: string) => sql.ref(`device_env_client.${column}`)

/** A declared, non-reserved blob slot referenced by its semantic name. */
const events = (name: Exclude<BlobName, 'reserved'>): EventsDimension => ({
  source: 'events',
  column: blobColumns[name],
})

// Bucket values are LOCALE-NEUTRAL machine tokens (never copy): the admin UI
// resolves them through `admin.analytics.metrics.value.*`.

/**
 * Screen resolution is session-static: only `has_static = true` rows carry it, so
 * this dimension aggregates over the beacon-covered subset. Nulls stay OUT of the
 * aggregation (never an `(unknown)` bucket).
 */
const screen: EnvDimension = {
  source: 'env',
  select: sql<string>`CAST(${env('screen_w')} AS VARCHAR) || '×' || CAST(${env('screen_h')} AS VARCHAR)`,
  require: sql<boolean>`${env('has_static')} = TRUE AND ${env('screen_w')} IS NOT NULL AND ${env('screen_h')} IS NOT NULL`,
}

const viewport: EnvDimension = {
  source: 'env',
  select: sql<string>`CASE
    WHEN ${env('viewport_w')} IS NULL THEN NULL
    WHEN ${env('viewport_w')} <= 480 THEN '≤480'
    WHEN ${env('viewport_w')} <= 768 THEN '≤768'
    WHEN ${env('viewport_w')} <= 1024 THEN '≤1024'
    WHEN ${env('viewport_w')} <= 1440 THEN '≤1440'
    WHEN ${env('viewport_w')} <= 1920 THEN '≤1920'
    ELSE '>1920'
  END`,
}

const dpr: EnvDimension = {
  source: 'env',
  select: sql<string>`CASE
    WHEN ${env('dpr')} IS NULL THEN NULL
    WHEN ${env('dpr')} = 1 THEN '1x'
    WHEN ${env('dpr')} = 1.5 THEN '1.5x'
    WHEN ${env('dpr')} = 2 THEN '2x'
    WHEN ${env('dpr')} = 2.5 THEN '2.5x'
    WHEN ${env('dpr')} = 3 THEN '3x'
    ELSE 'other'
  END`,
}

const touch: EnvDimension = {
  source: 'env',
  select: sql<string>`CASE
    WHEN ${env('touch_points')} IS NULL THEN NULL
    WHEN ${env('touch_points')} = 0 THEN 'none'
    WHEN ${env('touch_points')} <= 5 THEN '1-5'
    WHEN ${env('touch_points')} <= 10 THEN '6-10'
    ELSE 'many'
  END`,
}

const colorScheme: EnvDimension = {
  source: 'env',
  select: sql<string>`NULLIF(${env('color_scheme')}, '')`,
}

const netEffectiveType: EnvDimension = {
  source: 'env',
  select: sql<string>`NULLIF(${env('net_effective_type')}, '')`,
}

export const METRIC_DIMENSIONS: Record<MetricType, MetricDimension> = {
  country: events('country'),
  region: events('region'),
  city: events('city'),
  referer: events('refererHost'),
  language: events('language'),
  timezone: events('timezone'),
  os: events('os'),
  browser: events('browser'),
  browserType: events('browserType'),
  device: events('device'),
  deviceType: events('deviceType'),
  screen,
  viewport,
  dpr,
  touch,
  colorScheme,
  netEffectiveType,
  path: events('path'),
}

/**
 * Equality filter for a dimension's displayed values. Environment dimensions
 * filter through a semi-join (`event_id IN (SELECT …)`) built from the SAME
 * expression the panel groups by, so any dashboard query can honor an env filter
 * without joining the sidecar itself.
 */
export function dimensionWhere(dimension: MetricDimension, values: string[]): RawBuilder<boolean> {
  const list = sql.join(values)
  if (dimension.source === 'events') {
    return sql<boolean>`${sql.ref(`access_events.${dimension.column}`)} in (${list})`
  }
  const required = dimension.require === undefined ? sql`` : sql`and ${dimension.require}`
  return sql<boolean>`${sql.ref('access_events.event_id')} in (
    select ${sql.ref('device_env_client.event_id')} from device_env_client
    where ${dimension.select} in (${list}) ${required}
  )`
}
