import {
  type StagedBackup,
  assertDuckdbBackup,
  assertSqliteBackup,
  assertStagedBackupContainsAdmin,
  hasDuckdbMagic,
  restoreFromStagedBackup,
  stageBackup,
  type RestoreOptions,
} from '@kobato/server/domains/backup/services/restore'
import {
  isTarArchive,
  readCString,
  readOctal,
  TAR_BLOCK,
  tarEntryHeader,
  tarPaddingSize,
} from '@kobato/server/domains/backup/services/tar'
import { ActionFailure } from '@kobato/server/infra/http/errors'
import { mkdtempSync, rmSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { gunzipSync } from 'node:zlib'

/**
 * The in-memory backup tier, for tests only. Production paths stream
 * (stageBackup / createTarReadStream); these helpers pack, unpack, and
 * probe whole payloads in memory — convenient for fixtures, wrong for
 * a 500 MB upload. They lived inside the production modules until the
 * boundary was made explicit by moving them here.
 */

const GZIP_MAGIC_1 = 0x1f
const GZIP_MAGIC_2 = 0x8b

/** Gunzip when the payload is gzipped, pass through when raw. */
export function extractBackupFile(buffer: Buffer): Buffer {
  return buffer.length >= 2 && buffer[0] === GZIP_MAGIC_1 && buffer[1] === GZIP_MAGIC_2 ? gunzipSync(buffer) : buffer
}

export interface TarEntry {
  name: string
  data: Buffer
}

export function packTar(entries: TarEntry[]): Buffer {
  const blocks: Buffer[] = []
  for (const entry of entries) {
    blocks.push(tarEntryHeader(entry.name, entry.data.length))
    blocks.push(entry.data)
    const padding = tarPaddingSize(entry.data.length)
    if (padding !== 0) {
      blocks.push(Buffer.alloc(padding))
    }
  }
  blocks.push(Buffer.alloc(TAR_BLOCK * 2))
  return Buffer.concat(blocks)
}

function isZeroBlock(buffer: Buffer, offset: number): boolean {
  for (let i = offset; i < offset + TAR_BLOCK; i++) {
    if (buffer[i] !== 0) {
      return false
    }
  }
  return true
}

export function unpackTar(buffer: Buffer): TarEntry[] {
  if (!isTarArchive(buffer)) {
    throw new ActionFailure(400, '备份文件不是有效的归档格式')
  }
  const entries: TarEntry[] = []
  let offset = 0
  while (offset + TAR_BLOCK <= buffer.length) {
    if (isZeroBlock(buffer, offset)) {
      break
    }
    const name = readCString(buffer.subarray(offset, offset + 100))
    const size = readOctal(buffer, offset + 124, 12)
    if (name === '' || Number.isNaN(size) || size < 0 || offset + TAR_BLOCK + size > buffer.length) {
      throw new ActionFailure(400, '备份归档内容损坏')
    }
    entries.push({ name, data: buffer.subarray(offset + TAR_BLOCK, offset + TAR_BLOCK + size) })
    offset += TAR_BLOCK + Math.ceil(size / TAR_BLOCK) * TAR_BLOCK
  }
  return entries
}

export interface BackupPayload {
  /** The SQLite content database — null on an analytics-only restore. */
  content: Buffer | null
  /** The DuckDB analytics sidecar — null when the upload carries none. */
  analytics: Buffer | null
}

/**
 * Unpack a decompressed backup into its engine payloads, in memory
 * (subarray views — no copies). Accepted shapes: the two-file tar
 * archive, a raw SQLite file (content-only), a raw DuckDB file
 * (analytics-only).
 */
export function unpackBackupPayload(raw: Buffer): BackupPayload {
  if (isTarArchive(raw)) {
    const entries = unpackTar(raw)
    const content = entries.find((entry) => entry.name === 'kobato.db')
    if (content === undefined) {
      throw new ActionFailure(400, '备份归档中缺少内容数据库 kobato.db')
    }
    assertSqliteBackup(content.data)
    const analytics = entries.find((entry) => entry.name === 'analytics.duckdb')
    if (analytics !== undefined) {
      assertDuckdbBackup(analytics.data)
    }
    return { content: content.data, analytics: analytics?.data ?? null }
  }
  if (hasDuckdbMagic(raw)) {
    assertDuckdbBackup(raw)
    return { content: null, analytics: raw }
  }
  // Legacy content-only shape: raw SQLite bytes.
  assertSqliteBackup(raw)
  return { content: raw, analytics: null }
}

/** Buffer-based admin probe: unpack, stage the content to a temp file,
 *  and run the same staged check the production setup route runs. */
export async function assertBackupContainsAdmin(buffer: Buffer): Promise<void> {
  const { content } = unpackBackupPayload(extractBackupFile(buffer))
  if (content === null) {
    throw new ActionFailure(400, '备份中不包含管理员账号')
  }
  const dir = mkdtempSync(join(tmpdir(), 'kobato-restore-check-'))
  try {
    const probe = join(dir, 'probe.db')
    await writeFile(probe, content)
    const staged: StagedBackup = { dir, content: probe, analytics: null }
    await assertStagedBackupContainsAdmin(staged)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

/** Buffer-in convenience wrapper: stage, then swap into place. */
export async function restoreFromBackup(buffer: Buffer, fileName: string, options: RestoreOptions = {}): Promise<void> {
  const staged = await stageBackup(buffer)
  await restoreFromStagedBackup(staged, fileName, options)
}
