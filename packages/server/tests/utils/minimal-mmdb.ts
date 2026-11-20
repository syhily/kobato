import { mkdir, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

const METADATA_MARKER = Buffer.from([0xab, 0xcd, 0xef, ...Buffer.from('MaxMind.com', 'utf8')])

function ctrl(type: number, size: number): number {
  return (type << 5) | size
}

function utf8(value: string): Buffer {
  return Buffer.concat([Buffer.from([ctrl(2, value.length)]), Buffer.from(value, 'utf8')])
}

function uint(type: number, value: number): Buffer {
  if (value === 0) {
    return Buffer.from([ctrl(type, 0)])
  }
  const bytes: number[] = []
  for (let n = value; n > 0; n >>= 8) {
    bytes.unshift(n & 0xff)
  }
  return Buffer.concat([Buffer.from([ctrl(type, bytes.length)]), Buffer.from(bytes)])
}

function uint64Zero(): Buffer {
  return Buffer.from([0x00, 0x02])
}

function array(items: Buffer[]): Buffer {
  return Buffer.concat([Buffer.from([ctrl(11, items.length)]), ...items])
}

function map(entries: [Buffer, Buffer][]): Buffer {
  return Buffer.concat([Buffer.from([ctrl(7, entries.length)]), ...entries.flat()])
}

export function minimalMmdbBytes(): Buffer {
  const searchTree = Buffer.from([0x00, 0x00, 0x01, 0x00, 0x00, 0x01])
  const separator = Buffer.alloc(16)
  const dataSection = Buffer.from([0xe0])
  const metadata = map([
    [utf8('node_count'), uint(6, 1)],
    [utf8('record_size'), uint(5, 24)],
    [utf8('ip_version'), uint(5, 4)],
    [utf8('database_type'), utf8('kobato-test')],
    [utf8('languages'), array([utf8('en')])],
    [utf8('binary_format_major_version'), uint(5, 2)],
    [utf8('binary_format_minor_version'), uint(5, 0)],
    [utf8('build_epoch'), uint64Zero()],
  ])
  return Buffer.concat([searchTree, separator, dataSection, METADATA_MARKER, metadata])
}

export async function writeMinimalMmdb(path: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, minimalMmdbBytes())
}
