import type { ChildProcess } from 'node:child_process'

import { EventEmitter } from 'node:events'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockSpawn, mockDb } = vi.hoisted(() => {
  const mockSpawn = vi.fn()
  const mockDb = {
    execute: vi.fn(),
  }
  return { mockSpawn, mockDb }
})

vi.mock('node:child_process', () => ({
  spawn: mockSpawn,
}))

vi.mock('@/server/domains/backup/services/shared', () => ({
  ensurePgTools: vi.fn(async () => undefined),
  getPgConnectionOptions: vi.fn(() => ({
    args: ['--host=localhost', '--port=5432', '--dbname=app', '--username=app'],
    env: {},
  })),
  hasTimescaleDbRestoreFunctions: vi.fn(async () => true),
  MAX_SQL_SIZE: 500 * 1024 * 1024,
}))

vi.mock('@/server/infra/logger', () => ({
  getLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}))

import { restoreFromSql } from '@/server/domains/backup/services/restore'

beforeEach(() => {
  mockDb.execute.mockReset()
  mockSpawn.mockReset()
})

function createMockChildProcess(exitCode: number | null): ChildProcess {
  const cp = new EventEmitter() as ChildProcess
  const stdin = new EventEmitter()
  Object.assign(stdin, {
    writable: true,
    write: vi.fn(),
    end: vi.fn(),
  })
  Object.assign(cp, {
    stdin,
    stdout: null,
    stderr: null,
    stdio: [stdin, null, null] as any,
  })
  process.nextTick(() => {
    cp.emit('close', exitCode)
  })
  return cp
}

function extractSqlText(query: unknown): string {
  if (typeof query !== 'object' || query === null) return ''
  if ('queryChunks' in query && Array.isArray(query.queryChunks)) {
    return query.queryChunks
      .map((chunk: unknown) => {
        if (typeof chunk !== 'object' || chunk === null) return ''
        if ('value' in chunk && Array.isArray(chunk.value)) {
          return chunk.value.filter((v: unknown) => typeof v === 'string').join('')
        }
        return ''
      })
      .join('')
  }
  if ('sql' in query && typeof query.sql === 'string') return query.sql
  if ('toSQL' in query && typeof query.toSQL === 'function') {
    try {
      return query.toSQL().sql
    } catch {
      return ''
    }
  }
  return String(query)
}

function findExecuteCalls(sql: string) {
  return mockDb.execute.mock.calls.filter((call) => extractSqlText(call[0]).includes(sql))
}

describe('services/backup — restoreFromSql', () => {
  it('calls timescaledb_post_restore when psql exits non-zero', async () => {
    mockDb.execute.mockResolvedValue({ rows: [] })
    mockSpawn.mockReturnValue(createMockChildProcess(1))

    await expect(restoreFromSql(mockDb as any, 'CREATE TABLE users (id INT);')).rejects.toThrow(
      '数据库还原失败，psql 退出码 1',
    )

    expect(findExecuteCalls('timescaledb_pre_restore()')).toHaveLength(1)
    expect(findExecuteCalls('timescaledb_post_restore()')).toHaveLength(1)
  })

  it('calls timescaledb_post_restore when psql succeeds', async () => {
    mockDb.execute.mockResolvedValue({ rows: [] })
    mockSpawn.mockReturnValue(createMockChildProcess(0))

    await expect(restoreFromSql(mockDb as any, 'CREATE TABLE users (id INT);')).resolves.toBeUndefined()

    expect(findExecuteCalls('timescaledb_pre_restore()')).toHaveLength(1)
    expect(findExecuteCalls('timescaledb_post_restore()')).toHaveLength(1)
  })

  it('upgrades timescaledb with a literal version when dump is newer', async () => {
    const dumpSql = [
      'CREATE TABLE users (id INT);',
      'COPY _timescaledb_catalog.metadata (key, value) FROM stdin;',
      'timescaledb_version\t2.15.0',
      '\\.',
    ].join('\n')
    mockDb.execute.mockImplementation(async (query: unknown) => {
      const text = typeof query === 'string' ? query : extractSqlText(query)
      if (text.includes('extversion')) {
        return { rows: [{ extversion: '2.14.0' }] }
      }
      return { rows: [] }
    })
    mockSpawn.mockReturnValue(createMockChildProcess(0))

    await expect(restoreFromSql(mockDb as any, dumpSql)).resolves.toBeUndefined()

    expect(findExecuteCalls("ALTER EXTENSION timescaledb UPDATE TO '2.15.0'")).toHaveLength(1)
    expect(findExecuteCalls('ALTER EXTENSION timescaledb UPDATE TO $1')).toHaveLength(0)
    expect(findExecuteCalls('timescaledb_post_restore()')).toHaveLength(1)
  })
})
