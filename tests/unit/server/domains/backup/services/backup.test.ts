import { describe, expect, it } from 'vitest'

import { buildBackupS3Key, isValidBackupKey } from '@/server/domains/backup/services/backup'

describe('services/backup — key validation', () => {
  it('accepts valid timestamps', () => {
    expect(isValidBackupKey('2026-06-05T12-34-56')).toBe(true)
    expect(isValidBackupKey('2024-01-01T00-00-00')).toBe(true)
  })

  it('rejects invalid keys', () => {
    expect(isValidBackupKey('../etc/passwd')).toBe(false)
    expect(isValidBackupKey('backup/../../secret')).toBe(false)
    expect(isValidBackupKey('backup/x.sql.gz')).toBe(false)
    expect(isValidBackupKey('')).toBe(false)
    expect(isValidBackupKey('abc')).toBe(false)
    expect(isValidBackupKey('2026-06-05')).toBe(false)
    expect(isValidBackupKey('2026-06-05T12:34:56')).toBe(false)
  })

  it('builds correct S3 key from timestamp', () => {
    expect(buildBackupS3Key('2026-06-05T12-34-56')).toBe('backup/backup-2026-06-05T12-34-56.sql.gz')
  })
})
