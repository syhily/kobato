import { rollbackBinary } from '@kobato/server/infra/binary-rollback'
import { existsSync, unlinkSync } from 'node:fs'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

// Interface test for the rollback swap: real tmpdir, real fs — only the
// `<bak> --version` probe is injected (tests never exec a real binary).
// Exercises preflight checks → park → swap → cleanup through
// `rollbackBinary`, never its internals.

const RUNNING_BINARY = 'running-binary-v2-bad'
const BACKUP_BINARY = 'backup-binary-v1-good'

let dir: string
let execPath: string
let bakPath: string

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'kobato-rollback-'))
  execPath = join(dir, 'kobato')
  bakPath = `${execPath}.bak`
  await writeFile(execPath, RUNNING_BINARY)
  await writeFile(bakPath, BACKUP_BINARY)
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

function options(overrides: Partial<Parameters<typeof rollbackBinary>[0]> = {}) {
  return {
    execPath,
    currentVersion: '6.2.0',
    readBackupVersion: () => '6.1.0',
    ...overrides,
  }
}

describe('update/rollback', () => {
  it('swaps the backup into place and cleans up the parked build', async () => {
    const result = await rollbackBinary(options())

    expect(result).toEqual({ rolledBackTo: '6.1.0', previousVersion: '6.2.0' })
    await expect(readFile(execPath, 'utf-8')).resolves.toBe(BACKUP_BINARY)
    expect(existsSync(bakPath)).toBe(false)
    expect(existsSync(`${execPath}.pre-rollback`)).toBe(false)
  })

  it('refuses a -dev build before touching any file', async () => {
    await expect(rollbackBinary(options({ currentVersion: '6.2.0-dev.3' }))).rejects.toThrow('开发版本')

    await expect(readFile(execPath, 'utf-8')).resolves.toBe(RUNNING_BINARY)
    await expect(readFile(bakPath, 'utf-8')).resolves.toBe(BACKUP_BINARY)
  })

  it('refuses when no backup sibling exists', async () => {
    await rm(bakPath)

    await expect(rollbackBinary(options())).rejects.toThrow('找不到回滚副本')
    await expect(readFile(execPath, 'utf-8')).resolves.toBe(RUNNING_BINARY)
  })

  it('refuses when the backup version is unreadable', async () => {
    await expect(rollbackBinary(options({ readBackupVersion: () => null }))).rejects.toThrow('版本不可读')

    // Nothing was swapped: both files keep their original content.
    await expect(readFile(execPath, 'utf-8')).resolves.toBe(RUNNING_BINARY)
    await expect(readFile(bakPath, 'utf-8')).resolves.toBe(BACKUP_BINARY)
  })

  it('restores the running build when the backup rename fails mid-swap', async () => {
    // The probe deletes the backup, so the park succeeds but the swap
    // rename hits ENOENT — the parked build must be moved back.
    await expect(
      rollbackBinary(
        options({
          readBackupVersion: () => {
            unlinkSync(bakPath)
            return '6.1.0'
          },
        }),
      ),
    ).rejects.toThrow()

    await expect(readFile(execPath, 'utf-8')).resolves.toBe(RUNNING_BINARY)
    expect(existsSync(`${execPath}.pre-rollback`)).toBe(false)
  })
})
