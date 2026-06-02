import { describe, expect, it } from 'vitest'

import { backupSchema } from '@/server/domains/settings/schemas/backup'

describe('contract/backup-schema', () => {
  it('accepts valid daily schedule', () => {
    const result = backupSchema.safeParse({
      scheduled: { enabled: true, frequency: 'daily', hour: 3, minute: 0 },
      retention: { enabled: true, days: 30 },
    })
    expect(result.success).toBe(true)
  })

  it('accepts valid weekly schedule', () => {
    const result = backupSchema.safeParse({
      scheduled: { enabled: true, frequency: 'weekly', hour: 2, minute: 30, dayOfWeek: 1 },
      retention: { enabled: false, days: 30 },
    })
    expect(result.success).toBe(true)
  })

  it('accepts valid monthly schedule', () => {
    const result = backupSchema.safeParse({
      scheduled: { enabled: true, frequency: 'monthly', hour: 0, minute: 0, dayOfMonth: 15 },
      retention: { enabled: true, days: 7 },
    })
    expect(result.success).toBe(true)
  })

  it('accepts disabled schedule (no extra fields required)', () => {
    const result = backupSchema.safeParse({
      scheduled: { enabled: false, frequency: 'daily', hour: 3, minute: 0 },
      retention: { enabled: true, days: 30 },
    })
    expect(result.success).toBe(true)
  })

  it('rejects weekly without dayOfWeek', () => {
    const result = backupSchema.safeParse({
      scheduled: { enabled: true, frequency: 'weekly', hour: 3, minute: 0 },
      retention: { enabled: true, days: 30 },
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.path).toContain('dayOfWeek')
    }
  })

  it('rejects monthly without dayOfMonth', () => {
    const result = backupSchema.safeParse({
      scheduled: { enabled: true, frequency: 'monthly', hour: 3, minute: 0 },
      retention: { enabled: true, days: 30 },
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.path).toContain('dayOfMonth')
    }
  })

  it('rejects retention days below 1', () => {
    const result = backupSchema.safeParse({
      scheduled: { enabled: false, frequency: 'daily', hour: 3, minute: 0 },
      retention: { enabled: true, days: 0 },
    })
    expect(result.success).toBe(false)
  })

  it('rejects retention days above 365', () => {
    const result = backupSchema.safeParse({
      scheduled: { enabled: false, frequency: 'daily', hour: 3, minute: 0 },
      retention: { enabled: true, days: 366 },
    })
    expect(result.success).toBe(false)
  })

  it('rejects hour outside 0-23', () => {
    const result = backupSchema.safeParse({
      scheduled: { enabled: false, frequency: 'daily', hour: 24, minute: 0 },
      retention: { enabled: true, days: 30 },
    })
    expect(result.success).toBe(false)
  })

  it('rejects minute outside [0, 30]', () => {
    const result = backupSchema.safeParse({
      scheduled: { enabled: false, frequency: 'daily', hour: 3, minute: 15 },
      retention: { enabled: true, days: 30 },
    })
    expect(result.success).toBe(false)
  })
})
