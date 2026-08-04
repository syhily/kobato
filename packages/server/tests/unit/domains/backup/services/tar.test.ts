import { packTar, unpackTar } from '#/_helpers/backup-buffer'

import { isTarArchive } from '@kobato/server/domains/backup/services/tar'
import { describe, expect, it } from 'vitest'

describe('backup/services/tar', () => {
  it('round-trips entries with byte-exact payloads', () => {
    const first = Buffer.from('SQLite format 3\0'.padEnd(2000, 'x'))
    const second = Buffer.alloc(5000, 0xab)
    const archive = packTar([
      { name: 'kobato.db', data: first },
      { name: 'analytics.duckdb', data: second },
    ])

    expect(isTarArchive(archive)).toBe(true)
    expect(archive.length % 512).toBe(0)

    const entries = unpackTar(archive)
    expect(entries).toHaveLength(2)
    expect(entries[0]!.name).toBe('kobato.db')
    expect(entries[0]!.data.equals(first)).toBe(true)
    expect(entries[1]!.name).toBe('analytics.duckdb')
    expect(entries[1]!.data.equals(second)).toBe(true)
  })

  it('round-trips an empty entry', () => {
    const archive = packTar([{ name: 'empty', data: Buffer.alloc(0) }])
    const entries = unpackTar(archive)
    expect(entries).toHaveLength(1)
    expect(entries[0]!.data.length).toBe(0)
  })

  it('rejects non-tar payloads', () => {
    expect(isTarArchive(Buffer.from('SQLite format 3\0'))).toBe(false)
    expect(() => unpackTar(Buffer.from('SQLite format 3\0'.padEnd(600, 'x')))).toThrow()
  })

  it('rejects a truncated entry', () => {
    const archive = packTar([{ name: 'kobato.db', data: Buffer.alloc(1024, 1) }])
    expect(() => unpackTar(archive.subarray(0, 512 + 100))).toThrow()
  })
})
