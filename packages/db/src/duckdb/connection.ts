import type { DuckDBConnection, DuckDBInstance } from '@duckdb/node-api'
import type { Compilable } from 'kysely'

import { unsafeCast } from '@kobato/utils/unsafe-cast'

declare const analyticsHandleBrand: unique symbol
declare const analyticsWriterBrand: unique symbol
declare const analyticsReaderBrand: unique symbol
declare const analyticsQueryBrand: unique symbol

/**
 * Opaque analytics engine handle. Carries only lifecycle metadata — no native connection fields. Only `@kobato/db`
 * creates, opens, or consumes it; `@kobato/server` holds the token and passes it back into db operations.
 */
export interface AnalyticsHandle {
  readonly [analyticsHandleBrand]: true
  readonly path: string
  readonly inMemory: boolean
  closed: boolean
}

/**
 * The engine anatomy behind the opaque handle (instance + reader/writer connections). Db-plane only: never part of a
 * `@kobato/server` signature. Tests reach it through `engineOf`.
 */
export interface DuckDbEngine {
  instance: DuckDBInstance
  writer: DuckDBConnection
  reader: DuckDBConnection
  path: string
  inMemory: boolean
  closed: boolean
}

/**
 * Opaque analytics write capability. Only `@kobato/db` creates or consumes it — `@kobato/server` passes it back into
 * db operations and can call nothing on it. The runtime value IS the writer connection; the brand is compile-time only.
 */
export interface AnalyticsWriter {
  readonly [analyticsWriterBrand]: true
}

/** Opaque analytics read capability; the runtime value is the reader connection. */
export interface AnalyticsReader {
  readonly [analyticsReaderBrand]: true
}

/** Opaque compiled analytics query; the runtime value is a Kysely compilable produced inside `@kobato/db`. */
export interface AnalyticsQuery {
  readonly [analyticsQueryBrand]: true
}

export function analyticsHandleOf(engine: DuckDbEngine): AnalyticsHandle {
  return unsafeCast<AnalyticsHandle>(engine)
}

export function engineOf(handle: AnalyticsHandle): DuckDbEngine {
  return unsafeCast<DuckDbEngine>(handle)
}

export function analyticsWriterOf(handle: AnalyticsHandle): AnalyticsWriter {
  return unsafeCast<AnalyticsWriter>(engineOf(handle).writer)
}

export function analyticsReaderOf(handle: AnalyticsHandle): AnalyticsReader {
  return unsafeCast<AnalyticsReader>(engineOf(handle).reader)
}

export function analyticsQueryOf(query: Compilable): AnalyticsQuery {
  return unsafeCast<AnalyticsQuery>(query)
}

export function writerConnection(writer: AnalyticsWriter): DuckDBConnection {
  return unsafeCast<DuckDBConnection>(writer)
}

export function readerConnection(reader: AnalyticsReader): DuckDBConnection {
  return unsafeCast<DuckDBConnection>(reader)
}

export function compilableQuery(query: AnalyticsQuery): Compilable {
  return unsafeCast<Compilable>(query)
}
