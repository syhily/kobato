// Self-update pipeline: stage → download → verify → extract → verify →
// chmod → backup → swap, with best-effort restore and `.bak` rollback.
// Sidecars: archive hash checked pre-extraction, binary hash post-extraction.

import type { ReadableStream as WebReadableStream } from 'node:stream/web'

import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { chmod, mkdir, open, rename, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { createGunzip } from 'node:zlib'

import type { UpdateJobState } from '@/shared/contracts/update'

import { APP_REPOSITORY } from '@/shared/config/version'
import { unsafeCast } from '@/shared/utils/unsafe-cast'

const MAX_DOWNLOAD_BYTES = 512 * 1024 * 1024
const DOWNLOAD_TIMEOUT_MS = 5 * 60 * 1000
const STAGE_DIR_NAME = '.kobato-update'
const STAGED_ARCHIVE_NAME = 'kobato.tar.gz'
const STAGED_BINARY_NAME = 'kobato'
const BACKUP_SUFFIX = '.bak'
const TAR_BLOCK_SIZE = 512

export interface RunSelfUpdateOptions {
  tagName: string
  /** Defaults to `process.execPath`; tests pass a tmpdir binary. */
  execPath?: string
  onState?: (state: UpdateJobState) => void
}

function assetName(): string {
  return `kobato-linux-${process.arch}.tar.gz`
}

/** Sidecar hashing the raw binary inside the archive (`kobato-linux-<arch>.sha256`). */
function binaryHashAssetName(): string {
  return assetName().replace(/\.tar\.gz$/, '.sha256')
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

// Extracts the first regular-file entry (the CI archive holds exactly one).
async function extractBinaryFromTarGz(archivePath: string, destPath: string): Promise<void> {
  const tarPath = `${archivePath}.tar`
  await pipeline(createReadStream(archivePath), createGunzip(), createWriteStream(tarPath))

  const fh = await open(tarPath, 'r')
  try {
    const header = Buffer.alloc(TAR_BLOCK_SIZE)
    let offset = 0
    for (;;) {
      const { bytesRead } = await fh.read(header, 0, TAR_BLOCK_SIZE, offset)
      if (bytesRead < TAR_BLOCK_SIZE || header.every((byte) => byte === 0)) {
        throw new Error('更新包内未找到可执行文件')
      }
      const typeFlag = header[156]
      const size = Number.parseInt(header.toString('latin1', 124, 136), 8) || 0
      if (typeFlag === 0 || typeFlag === 48 /* '0' */) {
        await pipeline(
          createReadStream(tarPath, {
            start: offset + TAR_BLOCK_SIZE,
            end: offset + TAR_BLOCK_SIZE + size - 1,
          }),
          createWriteStream(destPath),
        )
        return
      }
      offset += TAR_BLOCK_SIZE + Math.ceil(size / TAR_BLOCK_SIZE) * TAR_BLOCK_SIZE
    }
  } finally {
    await fh.close()
  }
}

// Sidecars come from `sha256sum` in sea.yml as `<hash>  <name>`; if the
// workflow changes the format, this parser must change in lockstep.
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
  const stagedArchivePath = join(stageDir, STAGED_ARCHIVE_NAME)
  const stagedPath = join(stageDir, STAGED_BINARY_NAME)
  const backupPath = execPath + BACKUP_SUFFIX
  const assetBaseUrl = `${APP_REPOSITORY}/releases/download/${tagName}`
  const assetUrl = `${assetBaseUrl}/${assetName()}`

  await rm(stageDir, { recursive: true, force: true })
  await mkdir(stageDir, { recursive: true })

  let backedUp = false
  try {
    onState?.('downloading')
    await downloadToFile(assetUrl, stagedArchivePath)

    onState?.('verifying')
    const [shaRes, binShaRes] = await Promise.all([
      fetch(`${assetUrl}.sha256`, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) }),
      fetch(`${assetBaseUrl}/${binaryHashAssetName()}`, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) }),
    ])
    if (!shaRes.ok || !binShaRes.ok) {
      const status = shaRes.ok ? binShaRes.status : shaRes.status
      throw new Error(`下载校验文件失败（HTTP ${status}）`)
    }
    const expected = parseSha256Sidecar(await shaRes.text())
    const expectedBinary = parseSha256Sidecar(await binShaRes.text())
    const actual = await sha256File(stagedArchivePath)
    if (actual !== expected) {
      throw new Error('更新包校验失败，已中止')
    }
    try {
      await extractBinaryFromTarGz(stagedArchivePath, stagedPath)
    } catch (err) {
      throw new Error('更新包解压失败，已中止', { cause: err })
    }
    // The archive hash covers only the container; this check authenticates the extracted bytes.
    const actualBinary = await sha256File(stagedPath)
    if (actualBinary !== expectedBinary) {
      throw new Error('更新包内容校验失败，已中止')
    }
    await chmod(stagedPath, 0o755)

    onState?.('swapping')
    await rename(execPath, backupPath)
    backedUp = true
    await rename(stagedPath, execPath)
  } catch (err) {
    if (backedUp) {
      // Best-effort restore; a failure leaves the `.bak` for manual recovery.
      await rename(backupPath, execPath).catch(() => undefined)
    }
    throw err
  } finally {
    await rm(stageDir, { recursive: true, force: true }).catch(() => undefined)
  }
}
