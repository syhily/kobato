import { RESTORE_TEMP_PREFIX, sweepStaleRestoreDirs } from '@kobato/server/domains/backup/services/restore'
import { access, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

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
    const lookalike = join(tmpdir(), `kobato-restorex-${process.pid}`)
    await mkdir(lookalike)
    created.push(lookalike)

    await sweepStaleRestoreDirs()

    expect(await exists(lookalike)).toBe(true)
  })
})
