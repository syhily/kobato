import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { TEST_BLOG_SETTINGS_BUNDLE } from '#/_helpers/blog-settings'
import { setBlogSettingsBundleForTests } from '#/_helpers/blog-settings'

vi.mock('@/server/domains/backup/services/backup', () => ({
  createBackup: vi.fn(async () => ({ fileName: 'backup/x.sql.gz', size: 100 })),
  cleanupOldBackups: vi.fn(async () => undefined),
}))

vi.mock('@/server/domains/backup/services/shared', () => ({
  checkPgToolsAvailable: vi.fn(async () => true),
}))

vi.mock('@/server/bootstrap/db-lifecycle', () => ({
  getDb: vi.fn(() => ({})),
}))

vi.mock('@/server/infra/lifecycle', () => ({
  registerShutdownHook: vi.fn(),
}))

const { scheduleNextBackup, stopBackupScheduler, rescheduleBackup } = await import('@/server/domains/backup/scheduler')

describe('backup/scheduler — scheduleNextBackup', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
  })

  afterEach(() => {
    stopBackupScheduler()
    vi.useRealTimers()
  })

  it('retries when settings are not hydrated (bundle is null)', () => {
    setBlogSettingsBundleForTests(null)
    scheduleNextBackup()
    expect(vi.getTimerCount()).toBeGreaterThan(0)
  })

  it('does nothing when scheduled.enabled is false', () => {
    setBlogSettingsBundleForTests({
      ...TEST_BLOG_SETTINGS_BUNDLE,
      backup: {
        ...TEST_BLOG_SETTINGS_BUNDLE.backup!,
        scheduled: { ...TEST_BLOG_SETTINGS_BUNDLE.backup!.scheduled, enabled: false },
      },
    })
    scheduleNextBackup()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('schedules even when storage is not enabled (backups fall back to local)', () => {
    setBlogSettingsBundleForTests({
      ...TEST_BLOG_SETTINGS_BUNDLE,
      backup: {
        ...TEST_BLOG_SETTINGS_BUNDLE.backup!,
        scheduled: { enabled: true, frequency: 'daily', hour: 3, minute: 0 },
      },
      assets: {
        ...TEST_BLOG_SETTINGS_BUNDLE.assets!,
        storage: { ...TEST_BLOG_SETTINGS_BUNDLE.assets!.storage, enabled: false },
      },
    })
    scheduleNextBackup()
    expect(vi.getTimerCount()).toBeGreaterThan(0)
  })

  it('schedules a timer when backup + storage are enabled', () => {
    setBlogSettingsBundleForTests(TEST_BLOG_SETTINGS_BUNDLE)
    // Override enabled flag
    setBlogSettingsBundleForTests({
      ...TEST_BLOG_SETTINGS_BUNDLE,
      backup: {
        ...TEST_BLOG_SETTINGS_BUNDLE.backup!,
        scheduled: { enabled: true, frequency: 'daily', hour: 3, minute: 0 },
      },
    })
    scheduleNextBackup()
    expect(vi.getTimerCount()).toBeGreaterThan(0)
  })

  it('rescheduleBackup resets the retry counter and reschedules', async () => {
    setBlogSettingsBundleForTests({
      ...TEST_BLOG_SETTINGS_BUNDLE,
      backup: {
        ...TEST_BLOG_SETTINGS_BUNDLE.backup!,
        scheduled: { enabled: true, frequency: 'daily', hour: 3, minute: 0 },
      },
    })
    await rescheduleBackup()
    expect(vi.getTimerCount()).toBeGreaterThan(0)
  })

  it('stopBackupScheduler clears any pending timer', () => {
    setBlogSettingsBundleForTests({
      ...TEST_BLOG_SETTINGS_BUNDLE,
      backup: {
        ...TEST_BLOG_SETTINGS_BUNDLE.backup!,
        scheduled: { enabled: true, frequency: 'daily', hour: 3, minute: 0 },
      },
    })
    scheduleNextBackup()
    stopBackupScheduler()
    expect(vi.getTimerCount()).toBe(0)
  })
})
