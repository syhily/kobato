import type {
  CountersDto,
  HeatmapCell as WireHeatmapCell,
  MetricRow as WireMetricRow,
  RealtimeEvent as WireRealtimeEvent,
  ViewsDto,
  ViewsPoint as WireViewsPoint,
} from '@kobato/api/contracts/admin/analytics'
import type {
  CountersSummary,
  HeatmapCell,
  MetricRow,
  RealtimeEvent,
  ViewsPoint,
  ViewsSeries,
} from '@kobato/db/duckdb/queries/types'
import type { Assert, Equals } from '@kobato/utils/type-equals'

import { LOGIN_METHODS as WIRE_LOGIN_METHODS } from '@kobato/api/contracts/account/self'
import { METRIC_TYPES as WIRE_METRIC_TYPES } from '@kobato/api/contracts/admin/analytics'
import {
  JOB_RUN_STATUSES as WIRE_JOB_RUN_STATUSES,
  JOB_RUN_TRIGGERS as WIRE_JOB_RUN_TRIGGERS,
} from '@kobato/api/contracts/admin/jobs'
import {
  STORAGE_MIGRATION_PERSISTED_PHASES as WIRE_PERSISTED_PHASES,
  storageMigrationDirectionDto,
  storageMigrationPhaseDto,
} from '@kobato/api/contracts/admin/storage'
import {
  WEBMENTION_OUTBOX_STATUSES as WIRE_OUTBOX_STATUSES,
  WEBMENTION_STATUSES as WIRE_STATUSES,
  WEBMENTION_VERIFY_STATUSES as WIRE_VERIFY_STATUSES,
} from '@kobato/api/contracts/admin/webmentions'
import { NOTIFICATION_KINDS as WIRE_NOTIFICATION_KINDS } from '@kobato/api/contracts/public/notifications'
import { WEBMENTION_TYPES as WIRE_TYPES } from '@kobato/api/contracts/public/webmentions'
import { METRIC_TYPES } from '@kobato/db/duckdb/queries/types'
import { JOB_RUN_STATUSES, JOB_RUN_TRIGGERS } from '@kobato/db/sqlite/schema/job-run'
import { NOTIFICATION_KINDS } from '@kobato/db/sqlite/schema/notification'
import {
  STORAGE_MIGRATION_DIRECTIONS,
  STORAGE_MIGRATION_PERSISTED_PHASES,
} from '@kobato/db/sqlite/schema/storage-migration'
import { LOGIN_METHODS } from '@kobato/db/sqlite/schema/user'
import {
  WEBMENTION_OUTBOX_STATUSES,
  WEBMENTION_STATUSES,
  WEBMENTION_TYPES,
  WEBMENTION_VERIFY_STATUSES,
} from '@kobato/db/sqlite/schema/webmention'
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

  it('analytics metric vocabulary matches the wire schema enum', () => {
    expect([...METRIC_TYPES]).toEqual([...WIRE_METRIC_TYPES])
  })
})

type _countersShape = Assert<Equals<CountersSummary, CountersDto>>
type _viewsPointShape = Assert<Equals<ViewsPoint, WireViewsPoint>>
type _viewsSeriesShape = Assert<Equals<ViewsSeries, ViewsDto>>
type _heatmapCellShape = Assert<Equals<HeatmapCell, WireHeatmapCell>>
type _metricRowShape = Assert<Equals<MetricRow, WireMetricRow>>
type _realtimeEventShape = Assert<Equals<RealtimeEvent, WireRealtimeEvent>>
