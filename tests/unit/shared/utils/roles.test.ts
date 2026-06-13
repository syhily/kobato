import { describe, expect, it } from 'vitest'

import { ROLE_LEVELS, hasAtLeast, roleLabel } from '@/shared/utils/roles'

describe('shared/utils/roles — ROLE_LEVELS', () => {
  it('orders visitor below author below admin', () => {
    expect(ROLE_LEVELS.visitor).toBeLessThan(ROLE_LEVELS.author)
    expect(ROLE_LEVELS.author).toBeLessThan(ROLE_LEVELS.admin)
  })
})

describe('shared/utils/roles — hasAtLeast', () => {
  it('returns false for null/undefined', () => {
    expect(hasAtLeast(null, 'visitor')).toBe(false)
    expect(hasAtLeast(undefined, 'visitor')).toBe(false)
  })

  it('returns true when role equals the minimum', () => {
    expect(hasAtLeast('visitor', 'visitor')).toBe(true)
    expect(hasAtLeast('admin', 'admin')).toBe(true)
  })

  it('returns true when role exceeds the minimum', () => {
    expect(hasAtLeast('admin', 'visitor')).toBe(true)
    expect(hasAtLeast('author', 'visitor')).toBe(true)
    expect(hasAtLeast('admin', 'author')).toBe(true)
  })

  it('returns false when role is below the minimum', () => {
    expect(hasAtLeast('visitor', 'admin')).toBe(false)
    expect(hasAtLeast('author', 'admin')).toBe(false)
    expect(hasAtLeast('visitor', 'author')).toBe(false)
  })
})

describe('shared/utils/roles — roleLabel', () => {
  it('returns the Chinese label for each role', () => {
    expect(roleLabel('admin')).toBe('管理员')
    expect(roleLabel('author')).toBe('作者')
    expect(roleLabel('visitor')).toBe('访客')
  })
})
