import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { packTar } from '#/_helpers/backup-buffer'
import { ActionFailure } from '@/server/infra/http/errors'

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
    expect(readFileSync(`${holder.configPath!}.pre-restore`).toString()).toBe('{ "live": true }')
    expect(existsSync(staged.dir)).toBe(false)
    // The restored config carries security.* secrets — never more permissive
    // than the 0600 the boot-time writer produces.
    expect(statSync(holder.configPath!).mode & 0o777).toBe(0o600)
  })

  it('skips the config in env-only mode (no config file) and reports configApplied: false', async () => {
    const { restoreFromStagedBackup } = await import('@/server/domains/backup/services/restore')
    holder.configPath = null
    const staged = await stageFullArchive()

    const result = await restoreFromStagedBackup(staged, 'backup-test.db.tar.gz')

    expect(result.configApplied).toBe(false)
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

describe('restore — the config leg joins the pre-restore crash-consistency machinery', () => {
  it('cleanupPreRestoreFiles drops the parked live config and keeps the restored one', async () => {
    const { cleanupPreRestoreFiles, restoreFromStagedBackup } = await import('@/server/domains/backup/services/restore')
    const staged = await stageFullArchive()
    await restoreFromStagedBackup(staged, 'backup-test.db.tar.gz')

    await cleanupPreRestoreFiles()

    expect(readFileSync(holder.configPath!).equals(CONFIG_BYTES)).toBe(true)
    expect(existsSync(`${holder.configPath!}.pre-restore`)).toBe(false)
    expect(existsSync(`${holder.dbPath!}.pre-restore`)).toBe(false)
  })

  it('boot recovery restores a config target that went missing mid-swap', async () => {
    const { recoverPreRestoreFiles } = await import('@/server/domains/backup/services/restore')
    writeFileSync(`${holder.configPath!}.pre-restore`, '{ "live": true }')
    writeFileSync(`${holder.configPath!}.restore-staging`, '{ "half": ')
    rmSync(holder.configPath!)

    await recoverPreRestoreFiles()

    expect(readFileSync(holder.configPath!, 'utf8')).toBe('{ "live": true }')
    expect(existsSync(`${holder.configPath!}.pre-restore`)).toBe(false)
    expect(existsSync(`${holder.configPath!}.restore-staging`)).toBe(false)
  })

  it('boot recovery drops a stale config sibling when the target exists', async () => {
    const { recoverPreRestoreFiles } = await import('@/server/domains/backup/services/restore')
    writeFileSync(`${holder.configPath!}.pre-restore`, '{ "live": true }')

    await recoverPreRestoreFiles()

    expect(readFileSync(holder.configPath!, 'utf8')).toBe('{ "live": true }')
    expect(existsSync(`${holder.configPath!}.pre-restore`)).toBe(false)
  })

  it('a failed restore rolls the parked live config back', async () => {
    const { rollbackPreRestoreFiles, restoreFromStagedBackup } =
      await import('@/server/domains/backup/services/restore')
    const staged = await stageFullArchive()
    await restoreFromStagedBackup(staged, 'backup-test.db.tar.gz')
    expect(readFileSync(holder.configPath!).equals(CONFIG_BYTES)).toBe(true)

    await rollbackPreRestoreFiles()

    expect(readFileSync(holder.configPath!, 'utf8')).toBe('{ "live": true }')
    expect(existsSync(`${holder.configPath!}.pre-restore`)).toBe(false)
  })

  it('applies a config whose only issue is legacy keys (boot migrates them)', async () => {
    const { restoreFromStagedBackup, stageBackup } = await import('@/server/domains/backup/services/restore')
    const legacyConfig = Buffer.from(
      `${JSON.stringify({ auth: { sessionSecret: 's'.repeat(32) }, paths: { data: './data' } })}\n`,
    )
    const staged = await stageBackup(
      packTar([
        { name: 'kobato.db', data: fakeSqliteFile() },
        { name: 'kobato.config.json', data: legacyConfig },
      ]),
    )

    const result = await restoreFromStagedBackup(staged, 'backup-test.db.tar.gz')

    expect(result.configApplied).toBe(true)
    expect(readFileSync(holder.configPath!).equals(legacyConfig)).toBe(true)
  })
})

describe('restore — a config the next boot would reject never reaches the swap', () => {
  function archiveWithConfig(config: Buffer) {
    return packTar([
      { name: 'kobato.db', data: fakeSqliteFile() },
      { name: 'kobato.config.json', data: config },
    ])
  }

  it('rejects a value the boot schema rejects at staging time (short session secret)', async () => {
    const { stageBackup } = await import('@/server/domains/backup/services/restore')
    const archive = archiveWithConfig(Buffer.from(JSON.stringify({ security: { sessionSecret: 'x' } })))

    // A one-char session secret is a boot-time `.strict()` schema failure —
    // letting it land would `process.exit(1)` on the next restart.
    await expect(stageBackup(archive)).rejects.toThrow(ActionFailure)
    await expect(stageBackup(archive)).rejects.toMatchObject({
      descriptor: { messageKey: 'backup.error.configRejected' },
    })
  })

  it('rejects a config with a key the schema does not know', async () => {
    const { stageBackup } = await import('@/server/domains/backup/services/restore')
    const archive = archiveWithConfig(Buffer.from(JSON.stringify({ redis: { url: 'redis://x' } })))

    // `redis` is stripped by the boot-time legacy migration, so it is accepted —
    // this asserts the reuse of THAT pipeline rather than a stricter local one.
    const staged = await stageBackup(archive)
    rmSync(staged.dir, { recursive: true, force: true })

    const unknown = archiveWithConfig(Buffer.from(JSON.stringify({ totallyUnknown: true })))
    await expect(stageBackup(unknown)).rejects.toMatchObject({
      descriptor: { messageKey: 'backup.error.configRejected' },
    })
  })

  it('aborts a restore handed a bad staged config directly, before touching any live file', async () => {
    const { restoreFromStagedBackup } = await import('@/server/domains/backup/services/restore')
    const dir = mkdtempSync(join(tmpdir(), 'kobato-bad-config-'))
    try {
      const configPath = join(dir, 'kobato.config.json')
      const contentPath = join(dir, 'kobato.db')
      writeFileSync(configPath, JSON.stringify({ security: { encryptionKey: 'short' } }))
      writeFileSync(contentPath, fakeSqliteFile())

      await expect(
        restoreFromStagedBackup(
          { dir, content: contentPath, analytics: null, config: configPath },
          'backup-test.db.tar.gz',
        ),
      ).rejects.toThrow(ActionFailure)

      expect(readFileSync(holder.dbPath!, 'utf8')).toBe('live-db')
      expect(readFileSync(holder.configPath!, 'utf8')).toBe('{ "live": true }')
      expect(existsSync(`${holder.dbPath!}.pre-restore`)).toBe(false)
      expect(existsSync(`${holder.configPath!}.pre-restore`)).toBe(false)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
