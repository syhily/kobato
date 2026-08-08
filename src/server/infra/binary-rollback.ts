// `kobato rollback` — swaps the `<binary>.bak` sibling back into place.
// Runs from the SEA CLI before any bootstrap: no side effects; only node
// builtins + `@/shared/config/version`.

import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { rename, rm } from 'node:fs/promises'

import { APP_VERSION } from '@/shared/config/version'

const BACKUP_SUFFIX = '.bak'
const PRE_ROLLBACK_SUFFIX = '.pre-rollback'
const BAK_VERSION_TIMEOUT_MS = 10_000

export interface RollbackOptions {
  /** Defaults to `process.execPath`. */
  execPath?: string
  /** Defaults to the baked-in `APP_VERSION`. */
  currentVersion?: string
  /** Reads `<bak> --version`; injectable. */
  readBackupVersion?: (bakPath: string) => string | null
}

export interface RollbackResult {
  rolledBackTo: string
  previousVersion: string
}

/** Swap the `.bak` sibling back after the preflight checks; the restart belongs to the service manager. */
export async function rollbackBinary(options: RollbackOptions = {}): Promise<RollbackResult> {
  const execPath = options.execPath ?? process.execPath
  const currentVersion = options.currentVersion ?? APP_VERSION
  const readBackupVersion = options.readBackupVersion ?? defaultReadBackupVersion
  const bakPath = execPath + BACKUP_SUFFIX
  const preRollbackPath = execPath + PRE_ROLLBACK_SUFFIX

  if (currentVersion.includes('-dev')) {
    throw new Error('当前为开发版本，不支持回滚')
  }
  if (!existsSync(bakPath)) {
    throw new Error(`找不到回滚副本 ${bakPath} —— 只有经自更新升级过的部署才有回滚副本`)
  }
  const bakVersion = readBackupVersion(bakPath)
  if (bakVersion === null) {
    throw new Error(`回滚副本 ${bakPath} 不可执行或版本不可读，已中止`)
  }

  await rename(execPath, preRollbackPath)
  try {
    await rename(bakPath, execPath)
  } catch (err) {
    await rename(preRollbackPath, execPath).catch(() => undefined)
    throw err
  }
  await rm(preRollbackPath, { force: true }).catch(() => undefined)

  return { rolledBackTo: bakVersion, previousVersion: currentVersion }
}

function defaultReadBackupVersion(bakPath: string): string | null {
  // `<bak> --version` is a zero-side-effect, immediate proof the backup is an intact kobato binary.
  const res = spawnSync(bakPath, ['--version'], { timeout: BAK_VERSION_TIMEOUT_MS, encoding: 'utf-8' })
  if (res.error !== undefined || res.status !== 0) {
    return null
  }
  const match = /^kobato (\S+)\s*$/m.exec(res.stdout)
  return match?.[1] ?? null
}
