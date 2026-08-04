import { access, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The sweep reads the REAL temp dir — that's the surface a crashed
// process leaks into. Only the logger is silenced; the restore module's
// infra seams (db path resolution, analytics) are irrelevant to this
// path and mocked away like in restore-rollback.test.ts.
vi.mock('@kobato/server/infra/db/database', () => ({
  resolveDatabasePath: () => ':memory:',
  isInMemoryPath: (path: string) => path === ':memory:',
}))

vi.mock('@kobato/server/infra/analytics/duckdb', () => ({
  resolveAnalyticsPath: () => ':memory:',
}))

vi.mock('@kobato/server/infra/logger', () => ({
  getLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}))

import { RESTORE_TEMP_PREFIX, sweepStaleRestoreDirs } from '@kobato/server/domains/backup/services/restore'

// Anything this test creates in the shared temp dir, tracked for teardown.
const created: string[] = []

beforeEach(() => {
  created.length = 0
})

afterEach(async () => {
  for (const path of created) {
    await rm(path, { recursive: true, force: true })
  }
})

async function exists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

describe('services/restore — sweepStaleRestoreDirs', () => {
  it('removes only kobato-restore-* directories and leaves everything else', async () => {
    // mkdtemp guarantees the exact production prefix shape.
    const staleA = await mkdtemp(join(tmpdir(), RESTORE_TEMP_PREFIX))
    const staleB = await mkdtemp(join(tmpdir(), RESTORE_TEMP_PREFIX))
    await writeFile(join(staleA, 'payload'), 'orphaned')
    const unrelatedDir = await mkdtemp(join(tmpdir(), 'kobato-it-'))
    const prefixFile = join(tmpdir(), `${RESTORE_TEMP_PREFIX}not-a-dir-${process.pid}`)
    await writeFile(prefixFile, 'not a directory')
    created.push(staleA, staleB, unrelatedDir, prefixFile)

    await sweepStaleRestoreDirs()

    expect(await exists(staleA)).toBe(false)
    expect(await exists(staleB)).toBe(false)
    expect(await exists(unrelatedDir)).toBe(true)
    expect(await exists(prefixFile)).toBe(true)
  })

  it('does not touch a directory that merely resembles the prefix', async () => {
    // Missing the trailing dash / different casing must survive the sweep.
    const lookalike = join(tmpdir(), `kobato-restorex-${process.pid}`)
    await mkdir(lookalike)
    created.push(lookalike)

    await sweepStaleRestoreDirs()

    expect(await exists(lookalike)).toBe(true)
  })
})
