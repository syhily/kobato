import { ACCESS_EVENTS_DDL } from '@/server/domains/analytics/services/access-log'
import { DEVICE_ENV_CLIENT_DDL, DEVICE_ENV_SERVER_DDL } from '@/server/domains/analytics/services/device-env'

/**
 * Every table the DuckDB sidecar owns, in creation order. The DDL list and
 * the table-name list both derive from here, so the boot lifecycle, the
 * retention job, and the test harness cannot drift apart.
 */
const ANALYTICS_SCHEMA = [
  { name: 'access_events', ddl: ACCESS_EVENTS_DDL },
  { name: 'device_env_server', ddl: DEVICE_ENV_SERVER_DDL },
  { name: 'device_env_client', ddl: DEVICE_ENV_CLIENT_DDL },
] as const

export const ANALYTICS_TABLES = ANALYTICS_SCHEMA.map((table) => table.name)

export const ANALYTICS_DDL: string[] = ANALYTICS_SCHEMA.map((table) => table.ddl)
