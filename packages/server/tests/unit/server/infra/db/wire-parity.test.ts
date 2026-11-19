import type {
  CountersDto,
  HeatmapCell as WireHeatmapCell,
  MetricRow as WireMetricRow,
  RealtimeEvent as WireRealtimeEvent,
  ViewsDto,
  ViewsPoint as WireViewsPoint,
} from '@kobato/contracts/analytics.ts'
import type {
  CountersSummary,
  HeatmapCell,
  MetricRow,
  RealtimeEvent,
  ViewsPoint,
  ViewsSeries,
} from '@kobato/db/duckdb/queries/types.ts'
import type { Assert, Equals } from '@kobato/utils/type-equals.ts'

import {
  METRIC_TYPES as WIRE_METRIC_TYPES,
  PRESET_KEYS as WIRE_PRESET_KEYS,
  TIME_UNITS as WIRE_TIME_UNITS,
  computeDateRange as wireComputeDateRange,
  pickTimeUnit as wirePickTimeUnit,
} from '@kobato/contracts/analytics.ts'
import {
  JOB_RUN_STATUSES as WIRE_JOB_RUN_STATUSES,
  JOB_RUN_TRIGGERS as WIRE_JOB_RUN_TRIGGERS,
} from '@kobato/contracts/jobs.ts'
import { NOTIFICATION_KINDS as WIRE_NOTIFICATION_KINDS } from '@kobato/contracts/notifications.ts'
import {
  STORAGE_MIGRATION_PERSISTED_PHASES as WIRE_PERSISTED_PHASES,
  storageMigrationDirectionDto,
  storageMigrationPhaseDto,
} from '@kobato/contracts/storage.ts'
import { LOGIN_METHODS as WIRE_LOGIN_METHODS } from '@kobato/contracts/users.ts'
import {
  WEBMENTION_OUTBOX_STATUSES as WIRE_OUTBOX_STATUSES,
  WEBMENTION_STATUSES as WIRE_STATUSES,
  WEBMENTION_TYPES as WIRE_TYPES,
  WEBMENTION_VERIFY_STATUSES as WIRE_VERIFY_STATUSES,
} from '@kobato/contracts/webmentions.ts'
import {
  METRIC_TYPES,
  PRESET_KEYS,
  TIME_UNITS,
  computeDateRange,
  pickTimeUnit,
} from '@kobato/db/duckdb/queries/types.ts'
import { JOB_RUN_STATUSES, JOB_RUN_TRIGGERS } from '@kobato/db/schema/job-run.ts'
import { NOTIFICATION_KINDS } from '@kobato/db/schema/notification.ts'
import {
  STORAGE_MIGRATION_DIRECTIONS,
  STORAGE_MIGRATION_PERSISTED_PHASES,
} from '@kobato/db/schema/storage-migration.ts'
import { LOGIN_METHODS } from '@kobato/db/schema/user.ts'
import {
  WEBMENTION_OUTBOX_STATUSES,
  WEBMENTION_STATUSES,
  WEBMENTION_TYPES,
  WEBMENTION_VERIFY_STATUSES,
} from '@kobato/db/schema/webmention.ts'
import { describe, expect, it } from 'vitest'

describe('db ↔ contracts wire parity', () => {
  it('webmention persistence enums match the wire enums', () => {
    expect([...WEBMENTION_STATUSES]).toEqual([...WIRE_STATUSES])
    expect([...WEBMENTION_VERIFY_STATUSES]).toEqual([...WIRE_VERIFY_STATUSES])
    expect([...WEBMENTION_TYPES]).toEqual([...WIRE_TYPES])
    expect([...WEBMENTION_OUTBOX_STATUSES]).toEqual([...WIRE_OUTBOX_STATUSES])
  })

  it('notification, job-run, and login-method persistence enums match the wire enums', () => {
    expect([...NOTIFICATION_KINDS]).toEqual([...WIRE_NOTIFICATION_KINDS])
    expect([...JOB_RUN_TRIGGERS]).toEqual([...WIRE_JOB_RUN_TRIGGERS])
    expect([...JOB_RUN_STATUSES]).toEqual([...WIRE_JOB_RUN_STATUSES])
    expect([...LOGIN_METHODS]).toEqual([...WIRE_LOGIN_METHODS])
  })

  it('storage-migration persisted vocabulary matches the wire phase/direction enums', () => {
    expect([...STORAGE_MIGRATION_DIRECTIONS]).toEqual([...storageMigrationDirectionDto.options])
    expect([...STORAGE_MIGRATION_PERSISTED_PHASES]).toEqual([...WIRE_PERSISTED_PHASES])
    expect([...storageMigrationPhaseDto.options]).toEqual([
      'idle',
      ...STORAGE_MIGRATION_PERSISTED_PHASES,
      'interrupted',
    ])
  })

  it('analytics query vocabulary matches the wire schema enums', () => {
    expect([...PRESET_KEYS]).toEqual([...WIRE_PRESET_KEYS])
    expect([...TIME_UNITS]).toEqual([...WIRE_TIME_UNITS])
    expect([...METRIC_TYPES]).toEqual([...WIRE_METRIC_TYPES])
  })

  it('analytics time primitives behave identically to the wire twins', () => {
    const now = new Date('2026-11-18T15:42:11Z')
    for (const preset of PRESET_KEYS) {
      expect(computeDateRange(preset, now)).toEqual(wireComputeDateRange(preset, now))
    }

    for (const span of [0, 1, 3600, 3601, 86_399, 86_400, 86_401, 30 * 86_400]) {
      const range = { startAt: 0, endAt: span }
      expect(pickTimeUnit(range)).toBe(wirePickTimeUnit(range))
    }
  })
})

type _countersShape = Assert<Equals<CountersSummary, CountersDto>>
type _viewsPointShape = Assert<Equals<ViewsPoint, WireViewsPoint>>
type _viewsSeriesShape = Assert<Equals<ViewsSeries, ViewsDto>>
type _heatmapCellShape = Assert<Equals<HeatmapCell, WireHeatmapCell>>
type _metricRowShape = Assert<Equals<MetricRow, WireMetricRow>>
type _realtimeEventShape = Assert<Equals<RealtimeEvent, WireRealtimeEvent>>
