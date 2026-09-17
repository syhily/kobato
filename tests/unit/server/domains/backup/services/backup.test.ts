import { describe, expect, it } from 'vitest'

import { buildBackupS3Key, isValidBackupKey } from '@/server/domains/backup/services/backup'

describe('services/backup — key validation', () => {
  it('accepts legacy bare timestamps and suffixed backup ids', () => {
    expect(isValidBackupKey('2026-06-05T12-34-56')).toBe(true)
    expect(isValidBackupKey('2024-01-01T00-00-00')).toBe(true)
    expect(isValidBackupKey('2026-06-05T12-34-56-0123456789abcdef')).toBe(true)
  })

  it('rejects invalid keys', () => {
    expect(isValidBackupKey('../etc/passwd')).toBe(false)
    expect(isValidBackupKey('backup/../../secret')).toBe(false)
    expect(isValidBackupKey('backup/x.db.gz')).toBe(false)
    expect(isValidBackupKey('')).toBe(false)
    expect(isValidBackupKey('abc')).toBe(false)
    expect(isValidBackupKey('2026-06-05')).toBe(false)
    expect(isValidBackupKey('2026-06-05T12:34:56')).toBe(false)
    // Malformed suffixes: too short, uppercase, non-hex, dangling separator.
    expect(isValidBackupKey('2026-06-05T12-34-56-0123456789abcde')).toBe(false)
    expect(isValidBackupKey('2026-06-05T12-34-56-0123456789ABCDEF')).toBe(false)
    expect(isValidBackupKey('2026-06-05T12-34-56-0123456789abcdeg')).toBe(false)
    expect(isValidBackupKey('2026-06-05T12-34-56-')).toBe(false)
  })

  it('builds correct S3 key from a backup id', () => {
    expect(buildBackupS3Key('2026-06-05T12-34-56')).toBe('backup/backup-2026-06-05T12-34-56.db.tar.gz')
    expect(buildBackupS3Key('2026-06-05T12-34-56-0123456789abcdef')).toBe(
      'backup/backup-2026-06-05T12-34-56-0123456789abcdef.db.tar.gz',
    )
  })
})
