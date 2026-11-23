import type { BlobName } from '@kobato/db/duckdb/access-events'
import type { MetricType } from '@kobato/db/duckdb/queries/types'
import type { SQL } from 'drizzle-orm'

import { blobColumns } from '@kobato/db/duckdb/access-events'
import { analyticsIdentifier } from '@kobato/db/duckdb/query'
import { sql } from 'drizzle-orm'

export interface EventsDimension {
  source: 'events'
  column: string
}

export interface EnvDimension {
  source: 'env'
  select: SQL
  require?: SQL<boolean>
}

export type MetricDimension = EventsDimension | EnvDimension

const env = (column: string) => analyticsIdentifier(`device_env_client.${column}`)

const events = (name: Exclude<BlobName, 'reserved'>): EventsDimension => ({
  source: 'events',
  column: blobColumns[name],
})

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

export function dimensionWhere(dimension: MetricDimension, values: string[]): SQL<boolean> {
  const list = sql.join(
    values.map((value) => sql`${value}`),
    sql`, `,
  )
  if (dimension.source === 'events') {
    return sql<boolean>`${analyticsIdentifier(`access_events.${dimension.column}`)} in (${list})`
  }
  const required = dimension.require === undefined ? sql`` : sql`and ${dimension.require}`
  return sql<boolean>`${analyticsIdentifier('access_events.event_id')} in (
    select ${analyticsIdentifier('device_env_client.event_id')} from device_env_client
    where ${dimension.select} in (${list}) ${required}
  )`
}
