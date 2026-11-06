import { afterEach, describe, expect, it } from 'vitest'

import {
  BackupEncryptionMisconfiguredError,
  buildBackupS3Key,
  isValidBackupKey,
  resetBackupEncryption,
  resolveStoredEncryptionPassword,
  wireBackupEncryption,
} from '@/server/domains/backup/services/backup'

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

describe('services/backup — encryption resolver (fail closed on misconfiguration)', () => {
  afterEach(() => {
    resetBackupEncryption()
  })

  it('returns null when unwired or when encryption is off', () => {
    expect(resolveStoredEncryptionPassword()).toBeNull()
    wireBackupEncryption({ resolveEncryptionPassword: () => null })
    expect(resolveStoredEncryptionPassword()).toBeNull()
  })

  it('returns the wired password when encryption is configured', () => {
    wireBackupEncryption({ resolveEncryptionPassword: () => 'settings-password' })
    expect(resolveStoredEncryptionPassword()).toBe('settings-password')
  })

  it('declines a misconfigured resolver into the password prompt (restore path never 500s)', () => {
    wireBackupEncryption({
      resolveEncryptionPassword: () => {
        throw new BackupEncryptionMisconfiguredError('enabled but passwordless')
      },
    })
    expect(resolveStoredEncryptionPassword()).toBeNull()
  })

  it('does not swallow unrelated resolver failures', () => {
    wireBackupEncryption({
      resolveEncryptionPassword: () => {
        throw new Error('database on fire')
      },
    })
    expect(() => resolveStoredEncryptionPassword()).toThrow('database on fire')
  })
})
