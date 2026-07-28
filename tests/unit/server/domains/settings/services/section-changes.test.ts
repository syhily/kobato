import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  rescheduleBackup: vi.fn(),
  rescheduleArchive: vi.fn(),
  invalidateMailTransportCache: vi.fn(),
}))

vi.mock('@/server/domains/backup/scheduler', () => ({
  rescheduleBackup: mocks.rescheduleBackup,
}))

vi.mock('@/server/domains/audit/services/scheduler', () => ({
  rescheduleArchive: mocks.rescheduleArchive,
}))

vi.mock('@/server/infra/email/sender', () => ({
  invalidateMailTransportCache: mocks.invalidateMailTransportCache,
}))

const { SECTION_CHANGE_HANDLERS } = await import('@/server/domains/settings/services/section-changes')

describe('server/domains/settings/services/section-changes', () => {
  it('wires exactly the backup, limits, and mail sections', () => {
    expect([...SECTION_CHANGE_HANDLERS.keys()].sort()).toEqual(['backup', 'limits', 'mail'])
  })

  it('exposes a frozen read-only map', () => {
    expect(Object.isFrozen(SECTION_CHANGE_HANDLERS)).toBe(true)
  })

  it('dispatches backup to rescheduleBackup', async () => {
    await SECTION_CHANGE_HANDLERS.get('backup')?.()
    expect(mocks.rescheduleBackup).toHaveBeenCalledTimes(1)
  })

  it('dispatches limits to rescheduleArchive', async () => {
    await SECTION_CHANGE_HANDLERS.get('limits')?.()
    expect(mocks.rescheduleArchive).toHaveBeenCalledTimes(1)
  })

  it('dispatches mail to invalidateMailTransportCache', async () => {
    await SECTION_CHANGE_HANDLERS.get('mail')?.()
    expect(mocks.invalidateMailTransportCache).toHaveBeenCalledTimes(1)
  })
})
