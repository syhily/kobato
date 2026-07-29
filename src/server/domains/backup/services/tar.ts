import { ActionFailure } from '@/server/infra/http/errors'

/**
 * Minimal USTAR writer/reader for the two-file backup archive
 * (`kobato.db` + `analytics.duckdb` in one `.tar.gz`). No dependencies:
 * a tar entry is a 512-byte header + 512-padded payload; the archive
 * ends with two zero blocks. Only the fields we write are parsed back.
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

export function packTar(entries: TarEntry[]): Buffer {
  const blocks: Buffer[] = []
  for (const entry of entries) {
    if (entry.name.length > 99) {
      throw new Error(`tar entry name too long: ${entry.name}`)
    }
    const header = Buffer.alloc(BLOCK)
    writeString(header, 0, entry.name.length, entry.name)
    writeString(header, 100, 7, '0000644')
    writeString(header, 108, 7, '0000000')
    writeString(header, 116, 7, '0000000')
    writeOctal(header, 124, 12, entry.data.length)
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
    blocks.push(header)
    blocks.push(entry.data)
    const remainder = entry.data.length % BLOCK
    if (remainder !== 0) {
      blocks.push(Buffer.alloc(BLOCK - remainder))
    }
  }
  blocks.push(Buffer.alloc(BLOCK * 2))
  return Buffer.concat(blocks)
}

function isZeroBlock(buffer: Buffer, offset: number): boolean {
  for (let i = offset; i < offset + BLOCK; i++) {
    if (buffer[i] !== 0) {
      return false
    }
  }
  return true
}

/** Read a NUL-terminated latin1 string (tar's fixed-width fields). */
function readCString(buffer: Buffer): string {
  const end = buffer.indexOf(0)
  return buffer.toString('latin1', 0, end === -1 ? buffer.length : end)
}

function readOctal(buffer: Buffer, offset: number, length: number): number {
  return Number.parseInt(readCString(buffer.subarray(offset, offset + length)).trim(), 8)
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
