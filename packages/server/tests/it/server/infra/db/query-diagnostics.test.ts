import { sqliteOf } from '@kobato/db/sqlite/database'
import { startQueryDiagnostics, stopQueryDiagnostics } from '@kobato/server/infra/db/query-diagnostics'
import { __clearLogCaptureForTests, __logCaptureForTests } from '@kobato/server/infra/logger'
import { getTestDb } from '@kobato/server/tests/utils/integration-db'
import { sql } from 'drizzle-orm'
import diagnostics_channel from 'node:diagnostics_channel'
import { DatabaseSync } from 'node:sqlite'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'

interface CapturedQueryMessage {
  sql: unknown
  database: unknown
  duration: unknown
}

const messages: CapturedQueryMessage[] = []
const collector = (message: unknown) => {
  messages.push(message as CapturedQueryMessage)
}

diagnostics_channel.subscribe('sqlite.db.query', collector)

afterAll(() => {
  diagnostics_channel.unsubscribe('sqlite.db.query', collector)
  stopQueryDiagnostics()
})

beforeEach(() => {
  __clearLogCaptureForTests()
  messages.length = 0
  stopQueryDiagnostics()
})

describe("'sqlite.db.query' diagnostics channel", () => {
  it('publishes { sql, database, duration } per statement through the drizzle handle', () => {
    sqliteOf(getTestDb()).all(sql`SELECT ${'probe-value'} AS v`)

    const hit = messages.find((m) => typeof m.sql === 'string' && m.sql.includes('probe-value'))
    expect(hit).toBeDefined()
    expect(hit!.database).toBeInstanceOf(DatabaseSync)
    expect(typeof hit!.duration).toBe('number')
  })

  it('forwards timings to the debug log with bound values redacted (opt-in under vitest)', () => {
    startQueryDiagnostics({ enabledInTests: true })

    sqliteOf(getTestDb()).all(sql`SELECT ${'s3cret-bound-value'} AS v, ${42} AS n`)

    const entry = __logCaptureForTests().find((e) => e.scope === 'db.query' && e.msg === 'sqlite query')
    expect(entry).toBeDefined()
    expect(entry!.level).toBe('debug')
    const logged = entry!.ctx.sql
    expect(typeof logged).toBe('string')
    expect(logged).not.toContain('s3cret-bound-value')
    expect(logged).not.toContain('42')
    expect(logged).toBe('SELECT ? AS v, ? AS n')
    expect(typeof entry!.ctx.durationMs).toBe('number')
  })

  it('stays silent without the explicit opt-in (the boot wiring is a vitest no-op)', () => {
    startQueryDiagnostics()

    sqliteOf(getTestDb()).all(sql`SELECT ${'should-not-be-logged'} AS v`)

    expect(__logCaptureForTests().filter((e) => e.scope === 'db.query')).toEqual([])
  })
})
