import {
  cleanupPreRestoreFiles,
  recoverPreRestoreFiles,
  rollbackPreRestoreFiles,
} from '@kobato/server/domains/backup/services/restore.ts'
import { __setEnginePathsForTests } from '@kobato/server/infra/db/paths.ts'
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

let dir: string

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'kobato-rollback-test-'))
  __setEnginePathsForTests({ database: join(dir, 'kobato.db'), analytics: join(dir, 'analytics.duckdb') })
})

afterEach(async () => {
  __setEnginePathsForTests(null)
  await rm(dir, { recursive: true, force: true })
})

async function exists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

describe('services/restore — rollbackPreRestoreFiles', () => {
  it('moves the pre-restore originals back over the swapped files', async () => {
    await writeFile(join(dir, 'kobato.db'), 'corrupt-swapped')
    await writeFile(join(dir, 'kobato.db.pre-restore'), 'original-db')
    await writeFile(join(dir, 'analytics.duckdb'), 'corrupt-analytics')
    await writeFile(join(dir, 'analytics.duckdb.pre-restore'), 'original-analytics')

    await rollbackPreRestoreFiles()

    expect(await readFile(join(dir, 'kobato.db'), 'utf8')).toBe('original-db')
    expect(await readFile(join(dir, 'analytics.duckdb'), 'utf8')).toBe('original-analytics')
    expect(await exists(join(dir, 'kobato.db.pre-restore'))).toBe(false)
    expect(await exists(join(dir, 'analytics.duckdb.pre-restore'))).toBe(false)
  })

  it('never touches a live file that has no pre-restore sibling', async () => {
    await writeFile(join(dir, 'kobato.db'), 'corrupt-swapped')
    await writeFile(join(dir, 'kobato.db.pre-restore'), 'original-db')
    await writeFile(join(dir, 'analytics.duckdb'), 'live-analytics')

    await rollbackPreRestoreFiles()

    expect(await readFile(join(dir, 'kobato.db'), 'utf8')).toBe('original-db')
    expect(await readFile(join(dir, 'analytics.duckdb'), 'utf8')).toBe('live-analytics')
  })
})

describe('services/restore — cleanupPreRestoreFiles', () => {
  it('removes the pre-restore siblings and leaves the swapped files intact', async () => {
    await writeFile(join(dir, 'kobato.db'), 'new-db')
    await writeFile(join(dir, 'kobato.db.pre-restore'), 'original-db')
    await writeFile(join(dir, 'analytics.duckdb'), 'new-analytics')
    await writeFile(join(dir, 'analytics.duckdb.pre-restore'), 'original-analytics')

    await cleanupPreRestoreFiles()

    expect(await readFile(join(dir, 'kobato.db'), 'utf8')).toBe('new-db')
    expect(await readFile(join(dir, 'analytics.duckdb'), 'utf8')).toBe('new-analytics')
    expect(await exists(join(dir, 'kobato.db.pre-restore'))).toBe(false)
    expect(await exists(join(dir, 'analytics.duckdb.pre-restore'))).toBe(false)
  })

  it('is a no-op when no siblings exist', async () => {
    await writeFile(join(dir, 'kobato.db'), 'new-db')

    await expect(cleanupPreRestoreFiles()).resolves.toBeUndefined()
    expect(await readFile(join(dir, 'kobato.db'), 'utf8')).toBe('new-db')
  })
})

describe('services/restore — recoverPreRestoreFiles', () => {
  it('rolls the pre-restore sibling back when the swap target is MISSING (mid-swap crash)', async () => {
    await writeFile(join(dir, 'kobato.db.pre-restore'), 'original-db')
    await writeFile(join(dir, 'kobato.db.restore-staging'), 'partial-new-db')

    await recoverPreRestoreFiles()

    expect(await readFile(join(dir, 'kobato.db'), 'utf8')).toBe('original-db')
    expect(await exists(join(dir, 'kobato.db.pre-restore'))).toBe(false)
    expect(await exists(join(dir, 'kobato.db.restore-staging'))).toBe(false)
  })

  it('drops the sibling when the target EXISTS (swap completed before the crash)', async () => {
    await writeFile(join(dir, 'kobato.db'), 'new-db')
    await writeFile(join(dir, 'kobato.db.pre-restore'), 'original-db')
    await writeFile(join(dir, 'kobato.db.restore-staging'), 'orphan-staging')

    await recoverPreRestoreFiles()

    expect(await readFile(join(dir, 'kobato.db'), 'utf8')).toBe('new-db')
    expect(await exists(join(dir, 'kobato.db.pre-restore'))).toBe(false)
    expect(await exists(join(dir, 'kobato.db.restore-staging'))).toBe(false)
  })

  it('handles mixed engine states independently', async () => {
    await writeFile(join(dir, 'kobato.db.pre-restore'), 'original-db')
    await writeFile(join(dir, 'analytics.duckdb'), 'new-analytics')
    await writeFile(join(dir, 'analytics.duckdb.pre-restore'), 'original-analytics')

    await recoverPreRestoreFiles()

    expect(await readFile(join(dir, 'kobato.db'), 'utf8')).toBe('original-db')
    expect(await readFile(join(dir, 'analytics.duckdb'), 'utf8')).toBe('new-analytics')
    expect(await exists(join(dir, 'kobato.db.pre-restore'))).toBe(false)
    expect(await exists(join(dir, 'analytics.duckdb.pre-restore'))).toBe(false)
  })

  it('is a no-op on a clean boot', async () => {
    await writeFile(join(dir, 'kobato.db'), 'live-db')

    await expect(recoverPreRestoreFiles()).resolves.toBeUndefined()
    expect(await readFile(join(dir, 'kobato.db'), 'utf8')).toBe('live-db')
  })
})
