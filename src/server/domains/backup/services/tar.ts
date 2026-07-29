import { createReadStream } from 'node:fs'
import { open } from 'node:fs/promises'
import { Readable } from 'node:stream'

import { ActionFailure } from '@/server/infra/http/errors'

/**
 * Minimal USTAR writer/reader for the two-file backup archive
 * (`kobato.db` + `analytics.duckdb` in one `.tar.gz`). No dependencies:
 * a tar entry is a 512-byte header + 512-padded payload; the archive
 * ends with two zero blocks. Only the fields we write are parsed back.
 *
 * Production paths are STREAMING (`createTarReadStream` /
 * `listTarEntriesInFile`) — whole-file packing (`packTar`) and
 * subarray views (`unpackTar`) are for tests and tiny payloads.
 */

export interface TarEntry {
  name: string
  data: Buffer
}

const BLOCK = 512
const USTAR_OFFSET = 257

function writeString(target: Buffer, offset: number, length: number, value: string): void {
  target.write(value, offset, length, 'latin1')
}

function writeOctal(target: Buffer, offset: number, length: number, value: number): void {
  const text = value.toString(8).padStart(length - 1, '0')
  writeString(target, offset, length - 1, text)
  target[offset + length - 1] = 0
}

export function isTarArchive(buffer: Buffer): boolean {
  return (
    buffer.length > USTAR_OFFSET + 5 && buffer.subarray(USTAR_OFFSET, USTAR_OFFSET + 5).toString('latin1') === 'ustar'
  )
}

/** The 512-byte USTAR header for one entry. */
export function tarEntryHeader(name: string, size: number): Buffer {
  if (name.length > 99) {
    throw new Error(`tar entry name too long: ${name}`)
  }
  const header = Buffer.alloc(BLOCK)
  writeString(header, 0, name.length, name)
  writeString(header, 100, 7, '0000644')
  writeString(header, 108, 7, '0000000')
  writeString(header, 116, 7, '0000000')
  writeOctal(header, 124, 12, size)
  writeOctal(header, 136, 12, Math.floor(Date.now() / 1000))
  writeString(header, 156, 1, '0')
  writeString(header, 257, 5, 'ustar')
  writeString(header, 263, 2, '00')
  writeString(header, 265, 6, 'kobato')
  writeString(header, 297, 6, 'kobato')
  // Checksum: the header with the chksum field as eight spaces.
  writeString(header, 148, 8, '        ')
  let sum = 0
  for (const byte of header) {
    sum += byte
  }
  const chksumText = sum.toString(8).padStart(6, '0')
  writeString(header, 148, 6, chksumText)
  header[154] = 0
  header[155] = 0x20
  return header
}

export function tarPaddingSize(size: number): number {
  const remainder = size % BLOCK
  return remainder === 0 ? 0 : BLOCK - remainder
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
  blocks.push(Buffer.alloc(BLOCK * 2))
  return Buffer.concat(blocks)
}

/**
 * Stream an archive: headers, file contents, and padding flow through
 * without ever holding a full database file in memory. Yields header
 * blocks and file chunks in tar order, then the two trailing zero
 * blocks.
 */
export function createTarReadStream(entries: { name: string; path: string; size: number }[]): Readable {
  return Readable.from(
    (async function* () {
      for (const entry of entries) {
        yield tarEntryHeader(entry.name, entry.size)
        yield* createReadStream(entry.path)
        const padding = tarPaddingSize(entry.size)
        if (padding !== 0) {
          yield Buffer.alloc(padding)
        }
      }
      yield Buffer.alloc(BLOCK * 2)
    })(),
  )
}

export interface TarEntryMeta {
  name: string
  /** Offset of the entry's payload inside the archive file. */
  offset: number
  size: number
}

/** Read a NUL-terminated latin1 string (tar's fixed-width fields). */
function readCString(buffer: Buffer): string {
  const end = buffer.indexOf(0)
  return buffer.toString('latin1', 0, end === -1 ? buffer.length : end)
}

function readOctal(buffer: Buffer, offset: number, length: number): number {
  return Number.parseInt(readCString(buffer.subarray(offset, offset + length)).trim(), 8)
}

/**
 * List the entries of an archive FILE by reading only its 512-byte
 * headers sequentially — memory cost stays O(header) regardless of
 * archive size.
 */
export async function listTarEntriesInFile(rawPath: string): Promise<TarEntryMeta[]> {
  const handle = await open(rawPath, 'r')
  try {
    const entries: TarEntryMeta[] = []
    const header = Buffer.alloc(BLOCK)
    let offset = 0
    for (;;) {
      const { bytesRead } = await handle.read(header, 0, BLOCK, offset)
      if (bytesRead < BLOCK || header.every((byte) => byte === 0)) {
        break
      }
      const name = readCString(header.subarray(0, 100))
      const size = readOctal(header, 124, 12)
      if (name === '' || Number.isNaN(size) || size < 0) {
        throw new ActionFailure(400, '备份归档内容损坏')
      }
      entries.push({ name, offset: offset + BLOCK, size })
      offset += BLOCK + size + tarPaddingSize(size)
    }
    return entries
  } finally {
    await handle.close()
  }
}

function isZeroBlock(buffer: Buffer, offset: number): boolean {
  for (let i = offset; i < offset + BLOCK; i++) {
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
  while (offset + BLOCK <= buffer.length) {
    if (isZeroBlock(buffer, offset)) {
      break
    }
    const name = readCString(buffer.subarray(offset, offset + 100))
    const size = readOctal(buffer, offset + 124, 12)
    if (name === '' || Number.isNaN(size) || size < 0 || offset + BLOCK + size > buffer.length) {
      throw new ActionFailure(400, '备份归档内容损坏')
    }
    entries.push({ name, data: buffer.subarray(offset + BLOCK, offset + BLOCK + size) })
    offset += BLOCK + Math.ceil(size / BLOCK) * BLOCK
  }
  return entries
}
