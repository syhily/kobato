import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The rollback/cleanup helpers resolve the live engine paths through the
// infra seams; point them at a per-test temp dir. Everything else in the
// restore module (staging, magic checks) is untouched by these cases.
const paths = vi.hoisted(() => ({ db: '', analytics: '' }))

vi.mock('@/server/infra/db/database', () => ({
  resolveDatabasePath: () => paths.db,
  isInMemoryPath: (path: string) => path === ':memory:',
}))

vi.mock('@/server/infra/analytics/duckdb', () => ({
  resolveAnalyticsPath: () => paths.analytics,
}))

vi.mock('@/server/infra/logger', () => ({
  getLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}))

import { cleanupPreRestoreFiles, rollbackPreRestoreFiles } from '@/server/domains/backup/services/restore'

let dir: string

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'kobato-rollback-test-'))
  paths.db = join(dir, 'kobato.db')
  paths.analytics = join(dir, 'analytics.duckdb')
})

afterEach(async () => {
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
    await writeFile(paths.db, 'corrupt-swapped')
    await writeFile(`${paths.db}.pre-restore`, 'original-db')
    await writeFile(paths.analytics, 'corrupt-analytics')
    await writeFile(`${paths.analytics}.pre-restore`, 'original-analytics')

    await rollbackPreRestoreFiles()

    expect(await readFile(paths.db, 'utf8')).toBe('original-db')
    expect(await readFile(paths.analytics, 'utf8')).toBe('original-analytics')
    expect(await exists(`${paths.db}.pre-restore`)).toBe(false)
    expect(await exists(`${paths.analytics}.pre-restore`)).toBe(false)
  })

  it('never touches a live file that has no pre-restore sibling', async () => {
    // Analytics-only upload (or a target the swap skipped): the swap kept
    // no original — the rollback must leave the live file in place.
    await writeFile(paths.db, 'corrupt-swapped')
    await writeFile(`${paths.db}.pre-restore`, 'original-db')
    await writeFile(paths.analytics, 'live-analytics')

    await rollbackPreRestoreFiles()

    expect(await readFile(paths.db, 'utf8')).toBe('original-db')
    expect(await readFile(paths.analytics, 'utf8')).toBe('live-analytics')
  })
})

describe('services/restore — cleanupPreRestoreFiles', () => {
  it('removes the pre-restore siblings and leaves the swapped files intact', async () => {
    await writeFile(paths.db, 'new-db')
    await writeFile(`${paths.db}.pre-restore`, 'original-db')
    await writeFile(paths.analytics, 'new-analytics')
    await writeFile(`${paths.analytics}.pre-restore`, 'original-analytics')

    await cleanupPreRestoreFiles()

    expect(await readFile(paths.db, 'utf8')).toBe('new-db')
    expect(await readFile(paths.analytics, 'utf8')).toBe('new-analytics')
    expect(await exists(`${paths.db}.pre-restore`)).toBe(false)
    expect(await exists(`${paths.analytics}.pre-restore`)).toBe(false)
  })

  it('is a no-op when no siblings exist', async () => {
    await writeFile(paths.db, 'new-db')

    await expect(cleanupPreRestoreFiles()).resolves.toBeUndefined()
    expect(await readFile(paths.db, 'utf8')).toBe('new-db')
  })
})
