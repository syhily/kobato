import { ACCESS_EVENTS_DDL } from '@kobato/db/duckdb/access-events'
import { DEVICE_ENV_CLIENT_DDL, DEVICE_ENV_SERVER_DDL } from '@kobato/db/duckdb/device-env'
import { boolean, doublePrecision, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

const ANALYTICS_SCHEMA = [
  { name: 'access_events', ddl: ACCESS_EVENTS_DDL },
  { name: 'device_env_server', ddl: DEVICE_ENV_SERVER_DDL },
  { name: 'device_env_client', ddl: DEVICE_ENV_CLIENT_DDL },
] as const

export const ANALYTICS_TABLES = ANALYTICS_SCHEMA.map((table) => table.name)

export const ANALYTICS_DDL: string[] = ANALYTICS_SCHEMA.map((table) => table.ddl)

export const accessEvents = pgTable('access_events', {
  eventId: uuid('event_id').primaryKey(),
  index1: text('index1').notNull(),
  timestamp: timestamp('timestamp', { withTimezone: true }).notNull(),
  isBot: boolean('is_bot').notNull(),
  blob1: text('blob1').notNull(),
  blob2: text('blob2').notNull(),
  blob3: text('blob3').notNull(),
  blob4: text('blob4').notNull(),
  blob5: text('blob5').notNull(),
  blob6: text('blob6').notNull(),
  blob7: text('blob7').notNull(),
  blob8: text('blob8').notNull(),
  blob9: text('blob9').notNull(),
  blob10: text('blob10').notNull(),
  blob11: text('blob11').notNull(),
  blob12: text('blob12').notNull(),
  blob13: text('blob13').notNull(),
  blob14: text('blob14').notNull(),
  blob15: text('blob15').notNull(),
  blob16: text('blob16').notNull(),
  double1: doublePrecision('double1'),
  double2: doublePrecision('double2'),
})

export const deviceEnvClient = pgTable('device_env_client', {
  eventId: uuid('event_id').primaryKey(),
  timestamp: timestamp('timestamp', { withTimezone: true }).notNull(),
  screenW: integer('screen_w'),
  screenH: integer('screen_h'),
  availW: integer('avail_w'),
  availH: integer('avail_h'),
  viewportW: integer('viewport_w'),
  viewportH: integer('viewport_h'),
  dpr: doublePrecision('dpr'),
  colorDepth: integer('color_depth'),
  touchPoints: integer('touch_points'),
  pointer: text('pointer').notNull(),
  hover: text('hover').notNull(),
  colorScheme: text('color_scheme').notNull(),
  reducedMotion: boolean('reduced_motion'),
  netEffectiveType: text('net_effective_type').notNull(),
  netDownlink: doublePrecision('net_downlink'),
  netRtt: integer('net_rtt'),
  netSaveData: boolean('net_save_data'),
  locale: text('locale').notNull(),
  timezone: text('timezone').notNull(),
  hardwareConcurrency: integer('hardware_concurrency'),
  deviceMemory: doublePrecision('device_memory'),
  hasStatic: boolean('has_static').notNull(),
})
