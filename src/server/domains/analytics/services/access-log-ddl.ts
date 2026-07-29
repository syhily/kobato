/**
 * The access_log table shape — analytics-domain knowledge, owned here
 * (the infra DuckDB wrapper stays business-knowledge-free and receives
 * this DDL from the caller). No secondary indexes: zone maps +
 * columnar scans replace the six btree indexes the Postgres schema
 * carried (prototype-verified: 0.5 ms full count, 22–35 ms dashboard
 * queries at 1M rows).
 */
export const ACCESS_LOG_DDL = `
CREATE TABLE IF NOT EXISTS access_log (
  ts              TIMESTAMP NOT NULL,
  visitor_hash    VARCHAR NOT NULL,
  session_id      VARCHAR,
  ip              VARCHAR,
  path            VARCHAR NOT NULL,
  entity_type     VARCHAR,
  entity_id       BIGINT,
  referer         VARCHAR,
  referer_host    VARCHAR,
  country         VARCHAR,
  region          VARCHAR,
  city            VARCHAR,
  latitude        DOUBLE,
  longitude       DOUBLE,
  timezone        VARCHAR,
  language        VARCHAR,
  ua              VARCHAR,
  browser         VARCHAR,
  browser_version VARCHAR,
  os              VARCHAR,
  os_version      VARCHAR,
  device          VARCHAR,
  device_type     VARCHAR,
  is_bot          BOOLEAN NOT NULL
)
`

/** 180-day telemetry retention (plan §1.11) — fixed by design, not a
 *  setting: access_log is expendable telemetry, never backup-restored. */
export const ACCESS_LOG_RETENTION_DAYS = 180
