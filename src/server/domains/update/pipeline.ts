// Self-update pipeline (plan 090), modeled on AdGuardHome's
// `internal/updater`: stage → download → verify → chmod → backup → swap,
// with best-effort restore while the pipeline is still running and the
// stage dir always cleaned. Post-restart rollback is deliberately manual
// via the `<binary>.bak` sibling (decision Q4).

import type { ReadableStream as WebReadableStream } from 'node:stream/web'

import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { chmod, mkdir, rename, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'

import type { UpdateJobState } from '@/shared/types/update'

import { APP_REPOSITORY } from '@/shared/config/version'
import { unsafeCast } from '@/shared/utils/unsafe-cast'

const MAX_DOWNLOAD_BYTES = 512 * 1024 * 1024
const DOWNLOAD_TIMEOUT_MS = 5 * 60 * 1000
const STAGE_DIR_NAME = '.kobato-update'
const STAGED_BINARY_NAME = 'kobato'
const BACKUP_SUFFIX = '.bak'

export interface RunSelfUpdateOptions {
  tagName: string
  /** Defaults to `process.execPath`; tests pass a tmpdir binary. */
  execPath?: string
  onState?: (state: UpdateJobState) => void
}

function assetName(): string {
  return `kobato-linux-${process.arch}`
}

async function downloadToFile(url: string, dest: string): Promise<void> {
  const res = await fetch(url, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) })
  if (!res.ok || res.body === null) {
    throw new Error(`下载更新包失败（HTTP ${res.status}）`)
  }
  let received = 0
  await pipeline(
    Readable.fromWeb(unsafeCast<WebReadableStream>(res.body)),
    async function* (source: AsyncIterable<Uint8Array>) {
      for await (const chunk of source) {
        received += chunk.byteLength
        if (received > MAX_DOWNLOAD_BYTES) {
          throw new Error('更新包超过 512 MB 大小限制')
        }
        yield chunk
      }
    },
    createWriteStream(dest),
  )
}

async function sha256File(path: string): Promise<string> {
  const hash = createHash('sha256')
  const reader: AsyncIterable<Uint8Array> = createReadStream(path)
  for await (const chunk of reader) {
    hash.update(chunk)
  }
  return hash.digest('hex')
}

// The `.sha256` sidecar is produced by `sha256sum` in `sea.yml`:
// `<hash>  <name>`. If the workflow changes the format, this parser must
// change in lockstep.
export function parseSha256Sidecar(text: string): string {
  const hash = text.trim().split(/\s+/)[0] ?? ''
  if (!/^[0-9a-f]{64}$/i.test(hash)) {
    throw new Error('更新校验文件格式无效')
  }
  return hash.toLowerCase()
}

export async function runSelfUpdate({ tagName, execPath = process.execPath, onState }: RunSelfUpdateOptions) {
  const execDir = dirname(execPath)
  const stageDir = join(execDir, STAGE_DIR_NAME)
  const stagedPath = join(stageDir, STAGED_BINARY_NAME)
  const backupPath = execPath + BACKUP_SUFFIX
  const assetUrl = `${APP_REPOSITORY}/releases/download/${tagName}/${assetName()}`

  // Clean any stale stage dir from an interrupted run, then re-create.
  await rm(stageDir, { recursive: true, force: true })
  await mkdir(stageDir, { recursive: true })

  let backedUp = false
  try {
    onState?.('downloading')
    await downloadToFile(assetUrl, stagedPath)

    onState?.('verifying')
    const shaRes = await fetch(`${assetUrl}.sha256`, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) })
    if (!shaRes.ok) {
      throw new Error(`下载校验文件失败（HTTP ${shaRes.status}）`)
    }
    const expected = parseSha256Sidecar(await shaRes.text())
    const actual = await sha256File(stagedPath)
    if (actual !== expected) {
      throw new Error('更新包校验失败，已中止')
    }
    await chmod(stagedPath, 0o755)

    onState?.('swapping')
    await rename(execPath, backupPath)
    backedUp = true
    await rename(stagedPath, execPath)
  } catch (err) {
    if (backedUp) {
      // Best-effort restore while the pipeline is still running; a failed
      // restore leaves the `.bak` sibling for manual recovery.
      await rename(backupPath, execPath).catch(() => undefined)
    }
    throw err
  } finally {
    await rm(stageDir, { recursive: true, force: true }).catch(() => undefined)
  }
}
