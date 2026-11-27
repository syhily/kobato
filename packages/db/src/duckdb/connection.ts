import type { DuckDBConnection, DuckDBInstance } from '@duckdb/node-api'
import type { Query, SQLWrapper } from 'drizzle-orm'

import { unsafeCast } from '@kobato/base/utils/unsafe-cast'

declare const analyticsHandleBrand: unique symbol
declare const analyticsWriterBrand: unique symbol
declare const analyticsReaderBrand: unique symbol
declare const analyticsQueryBrand: unique symbol

export interface AnalyticsHandle {
  readonly [analyticsHandleBrand]: true
  readonly path: string
  readonly inMemory: boolean
  closed: boolean
}

export interface DuckDbEngine {
  instance: DuckDBInstance
  writer: DuckDBConnection
  reader: DuckDBConnection
  path: string
  inMemory: boolean
  closed: boolean
}

export interface AnalyticsWriter {
  readonly [analyticsWriterBrand]: true
}

export interface AnalyticsReader {
  readonly [analyticsReaderBrand]: true
}

export interface AnalyticsCompilable extends SQLWrapper {
  toSQL(): Query
}

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

export function analyticsQueryOf(query: AnalyticsCompilable): AnalyticsQuery {
  return unsafeCast<AnalyticsQuery>(query)
}

export function writerConnection(writer: AnalyticsWriter): DuckDBConnection {
  return unsafeCast<DuckDBConnection>(writer)
}

export function readerConnection(reader: AnalyticsReader): DuckDBConnection {
  return unsafeCast<DuckDBConnection>(reader)
}

export function compilableQuery(query: AnalyticsQuery): AnalyticsCompilable {
  return unsafeCast<AnalyticsCompilable>(query)
}
