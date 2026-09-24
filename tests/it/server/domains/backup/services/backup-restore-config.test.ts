import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { packTar } from '#/_helpers/backup-buffer'

// The restore swap targets the LIVE engine/config paths — resolved at call
// time through these seams. Point them at per-test temp files; every other
// export stays real.
const holder = vi.hoisted(() => ({
  dir: null as string | null,
  dbPath: null as string | null,
  analyticsPath: null as string | null,
  configPath: null as string | null,
}))

vi.mock('@/server/infra/config', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/server/infra/config')>()),
  resolveConfigFilePath: () => holder.configPath,
}))

vi.mock('@/server/infra/db/database', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/server/infra/db/database')>()),
  resolveDatabasePath: () => holder.dbPath,
}))

vi.mock('@/server/infra/analytics/duckdb', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/server/infra/analytics/duckdb')>()),
  resolveAnalyticsPath: () => holder.analyticsPath,
}))

const SQLITE_HEADER = Buffer.from('SQLite format 3\0', 'latin1')

function fakeSqliteFile(size = 1024): Buffer {
  return Buffer.concat([SQLITE_HEADER, Buffer.alloc(size - SQLITE_HEADER.length, 1)])
}

function fakeDuckdbFile(size = 1024): Buffer {
  const buffer = Buffer.alloc(size, 2)
  buffer.write('DUCK', 8, 'latin1')
  return buffer
}

const CONFIG_BYTES = Buffer.from('{\n  "server": { "port": 4321 }\n}\n')

beforeEach(() => {
  holder.dir = mkdtempSync(join(tmpdir(), 'kobato-restore-config-it-'))
  holder.dbPath = join(holder.dir, 'kobato.db')
  holder.analyticsPath = join(holder.dir, 'analytics.duckdb')
  holder.configPath = join(holder.dir, 'kobato.config.json')
  writeFileSync(holder.dbPath, 'live-db')
  writeFileSync(holder.analyticsPath, 'live-analytics')
  writeFileSync(holder.configPath, '{ "live": true }')
})

afterEach(() => {
  rmSync(holder.dir!, { recursive: true, force: true })
  holder.dir = null
})

async function stageFullArchive() {
  const { stageBackup } = await import('@/server/domains/backup/services/restore')
  return stageBackup(
    packTar([
      { name: 'kobato.db', data: fakeSqliteFile() },
      { name: 'analytics.duckdb', data: fakeDuckdbFile() },
      { name: 'kobato.config.json', data: CONFIG_BYTES },
    ]),
  )
}

describe('restoreFromStagedBackup — sqlite → duckdb → config', () => {
  it('applies the content database, the analytics sidecar, and the config file in one run', async () => {
    const { restoreFromStagedBackup } = await import('@/server/domains/backup/services/restore')
    const staged = await stageFullArchive()

    const result = await restoreFromStagedBackup(staged, 'backup-test.db.tar.gz')

    expect(result.configApplied).toBe(true)
    expect(readFileSync(holder.dbPath!).equals(fakeSqliteFile())).toBe(true)
    expect(readFileSync(holder.analyticsPath!).equals(fakeDuckdbFile())).toBe(true)
    expect(readFileSync(holder.configPath!).equals(CONFIG_BYTES)).toBe(true)

    // The originals are parked for the rollback path; the staged dir is swept.
    expect(readFileSync(`${holder.dbPath!}.pre-restore`).toString()).toBe('live-db')
    expect(readFileSync(`${holder.analyticsPath!}.pre-restore`).toString()).toBe('live-analytics')
    expect(existsSync(staged.dir)).toBe(false)
  })

  it('skips the config in env-only mode (no config file) and reports configApplied: false', async () => {
    const { restoreFromStagedBackup } = await import('@/server/domains/backup/services/restore')
    holder.configPath = null
    const staged = await stageFullArchive()

    const result = await restoreFromStagedBackup(staged, 'backup-test.db.tar.gz')

    expect(result.configApplied).toBe(false)
    // The engine swaps are unaffected by the skipped config leg.
    expect(readFileSync(holder.dbPath!).equals(fakeSqliteFile())).toBe(true)
    expect(readFileSync(holder.analyticsPath!).equals(fakeDuckdbFile())).toBe(true)
  })

  it('a config write failure never rolls back the completed engine swaps', async () => {
    const { restoreFromStagedBackup } = await import('@/server/domains/backup/services/restore')
    // Unwritable target: the parent directory does not exist.
    holder.configPath = join(holder.dir!, 'missing-dir', 'kobato.config.json')
    const staged = await stageFullArchive()

    const result = await restoreFromStagedBackup(staged, 'backup-test.db.tar.gz')

    expect(result.configApplied).toBe(false)
    expect(readFileSync(holder.dbPath!).equals(fakeSqliteFile())).toBe(true)
    expect(readFileSync(holder.analyticsPath!).equals(fakeDuckdbFile())).toBe(true)
  })

  it('withAnalytics: false leaves the live sidecar untouched (the setup restore path)', async () => {
    const { restoreFromStagedBackup } = await import('@/server/domains/backup/services/restore')
    const staged = await stageFullArchive()

    const result = await restoreFromStagedBackup(staged, 'backup-test.db.tar.gz', { withAnalytics: false })

    expect(result.configApplied).toBe(true)
    expect(readFileSync(holder.dbPath!).equals(fakeSqliteFile())).toBe(true)
    expect(readFileSync(holder.analyticsPath!).toString()).toBe('live-analytics')
    expect(existsSync(`${holder.analyticsPath!}.pre-restore`)).toBe(false)
  })
})
