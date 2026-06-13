import { describe, expect, it } from 'vitest'

import { listUsersSchema, muteUserSchema, userIdSchema } from '@/server/domains/users/schema'

describe('server/domains/users/schema — listUsersSchema', () => {
  it('applies defaults for offset, limit, role, sortBy', () => {
    const result = listUsersSchema.safeParse({})
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.offset).toBe(0)
      expect(result.data.limit).toBe(20)
      expect(result.data.role).toBe('all')
      expect(result.data.sortBy).toBe('recent')
    }
  })

  it('coerces string "true"/"false" into boolean for includeDeleted', () => {
    const t = listUsersSchema.safeParse({ includeDeleted: 'true' })
    const f = listUsersSchema.safeParse({ includeDeleted: 'false' })
    expect(t.data?.includeDeleted).toBe(true)
    expect(f.data?.includeDeleted).toBe(false)
  })

  it('coerces hasPosts / hasPages flag strings into booleans', () => {
    const t = listUsersSchema.safeParse({ hasPosts: 'true', hasPages: 'false' })
    expect(t.data?.hasPosts).toBe(true)
    expect(t.data?.hasPages).toBe(false)
  })

  it('rejects limit above 100', () => {
    expect(listUsersSchema.safeParse({ limit: 200 }).success).toBe(false)
  })

  it('rejects an unknown role enum', () => {
    expect(listUsersSchema.safeParse({ role: 'super' }).success).toBe(false)
  })

  it('rejects an unknown sortBy enum', () => {
    expect(listUsersSchema.safeParse({ sortBy: 'random' }).success).toBe(false)
  })
})

describe('server/domains/users/schema — userIdSchema', () => {
  it('accepts a non-empty userId', () => {
    expect(userIdSchema.safeParse({ userId: '1' }).success).toBe(true)
  })

  it('rejects an empty userId', () => {
    expect(userIdSchema.safeParse({ userId: '' }).success).toBe(false)
  })
})

describe('server/domains/users/schema — muteUserSchema', () => {
  it('accepts a boolean muted flag', () => {
    const result = muteUserSchema.safeParse({ userId: '1', muted: true })
    expect(result.success).toBe(true)
  })

  it('accepts a "true"/"false" string for muted', () => {
    expect(muteUserSchema.safeParse({ userId: '1', muted: 'true' }).success).toBe(true)
    expect(muteUserSchema.safeParse({ userId: '1', muted: 'false' }).success).toBe(true)
  })

  it('rejects an unknown muted string value', () => {
    expect(muteUserSchema.safeParse({ userId: '1', muted: 'yes' }).success).toBe(false)
  })
})
