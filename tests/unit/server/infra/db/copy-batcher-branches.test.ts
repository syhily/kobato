import type { Pool } from 'pg'

import { describe, expect, it } from 'vitest'

import { CopyBatcher, type FlushResult } from '@/server/infra/db/copy-batcher'

// Minimal Pool stub — the constructor stores it but never invokes it during
// validation, so an empty object is sufficient.
function fakePool(): Pool {
  return {} as Pool
}

class TestBatcher extends CopyBatcher<string> {
  protected toCsvRow(event: string): string {
    return event
  }
  protected async onCopyFailed(): Promise<FlushResult> {
    return { committed: 0, deadLettered: 0 }
  }
}

describe('server/infra/db/copy-batcher — constructor identifier validation', () => {
  it('accepts a valid table name and column names', () => {
    expect(
      () =>
        new TestBatcher({ flushIntervalMs: 1000, flushThreshold: 10 }, 'events', ['id', 'payload'], 'test', fakePool()),
    ).not.toThrow()
  })

  it('accepts underscore-prefixed and digit-containing identifiers', () => {
    expect(
      () =>
        new TestBatcher(
          { flushIntervalMs: 1000, flushThreshold: 10 },
          '_event_log',
          ['_id', 'col_1', 'x9'],
          'test',
          fakePool(),
        ),
    ).not.toThrow()
  })

  it('throws when the table name fails the identifier check', () => {
    expect(
      () => new TestBatcher({ flushIntervalMs: 1000, flushThreshold: 10 }, 'bad-table!', ['id'], 'test', fakePool()),
    ).toThrow(/Invalid table name for COPY: bad-table!/)
  })

  it('throws when the table name starts with a digit', () => {
    expect(
      () => new TestBatcher({ flushIntervalMs: 1000, flushThreshold: 10 }, '1events', ['id'], 'test', fakePool()),
    ).toThrow(/Invalid table name for COPY: 1events/)
  })

  it('throws when any column name fails the identifier check', () => {
    expect(
      () =>
        new TestBatcher({ flushIntervalMs: 1000, flushThreshold: 10 }, 'events', ['id', 'bad col'], 'test', fakePool()),
    ).toThrow(/Invalid column name for COPY: bad col/)
  })

  it('throws on the first invalid column (uppercase rejected)', () => {
    expect(
      () =>
        new TestBatcher({ flushIntervalMs: 1000, flushThreshold: 10 }, 'events', ['id', 'BadCol'], 'test', fakePool()),
    ).toThrow(/Invalid column name for COPY: BadCol/)
  })

  it('rejects an empty table name', () => {
    expect(
      () => new TestBatcher({ flushIntervalMs: 1000, flushThreshold: 10 }, '', ['id'], 'test', fakePool()),
    ).toThrow(/Invalid table name for COPY:/)
  })

  it('rejects a column name containing a space', () => {
    expect(
      () => new TestBatcher({ flushIntervalMs: 1000, flushThreshold: 10 }, 'events', [' id'], 'test', fakePool()),
    ).toThrow(/Invalid column name for COPY:  id/)
  })
})
