import { ACCESS_EVENTS_DDL } from '@kobato/db/duckdb/access-events.ts'
import { DEVICE_ENV_CLIENT_DDL, DEVICE_ENV_SERVER_DDL } from '@kobato/db/duckdb/device-env.ts'

const ANALYTICS_SCHEMA = [
  { name: 'access_events', ddl: ACCESS_EVENTS_DDL },
  { name: 'device_env_server', ddl: DEVICE_ENV_SERVER_DDL },
  { name: 'device_env_client', ddl: DEVICE_ENV_CLIENT_DDL },
] as const

export const ANALYTICS_TABLES = ANALYTICS_SCHEMA.map((table) => table.name)

export const ANALYTICS_DDL: string[] = ANALYTICS_SCHEMA.map((table) => table.ddl)
