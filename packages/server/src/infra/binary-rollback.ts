// Manual rollback for the self-update pipeline: `kobato rollback` swaps the
// `<binary>.bak` sibling (left behind by the update swap) back into place.
// Invoked from the SEA CLI surface (`@kobato/server/infra/sea-cli`) BEFORE any
// bootstrap — this module must stay free of side effects and may only
// depend on node builtins and `@kobato/shared/config/version`, same as sea-cli.

import { APP_VERSION } from '@kobato/shared/config/version'
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { rename, rm } from 'node:fs/promises'

const BACKUP_SUFFIX = '.bak'
const PRE_ROLLBACK_SUFFIX = '.pre-rollback'
const BAK_VERSION_TIMEOUT_MS = 10_000

export interface RollbackOptions {
  /** Defaults to `process.execPath`; tests pass a tmpdir binary. */
  execPath?: string
  /** Defaults to the baked-in `APP_VERSION`; tests inject. */
  currentVersion?: string
  /** Reads `<bak> --version`; injectable so tests never exec a real binary. */
  readBackupVersion?: (bakPath: string) => string | null
}

export interface RollbackResult {
  rolledBackTo: string
  previousVersion: string
}

/**
 * Swap the `.bak` sibling back into place after the three preflight checks:
 * the backup exists (only self-updated deployments have one), the RUNNING
 * build is not a `-dev` version (dev builds must never touch deployment
 * files), and the backup proves itself an intact kobato binary by answering
 * `--version`. The restart afterwards belongs to the service manager — the
 * running process keeps its old inode until then, so the swap is safe even
 * while the server is up.
 */
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

  // The reverse of the pipeline swap, with the same failure semantics: park
  // the running build aside, move the backup in, then drop the parked copy.
  // A failure mid-swap restores the original layout best-effort.
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
  // `<bak> --version` exits immediately with zero side effects (the SEA CLI
  // surface guarantees it evaluates ahead of every bootstrap) — the
  // cheapest proof the backup is an intact, executable kobato binary.
  const res = spawnSync(bakPath, ['--version'], { timeout: BAK_VERSION_TIMEOUT_MS, encoding: 'utf-8' })
  if (res.error !== undefined || res.status !== 0) {
    return null
  }
  const match = /^kobato (\S+)\s*$/m.exec(res.stdout)
  return match?.[1] ?? null
}
