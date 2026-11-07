import { describe, expect, it } from 'vitest'

import { makeTranslator } from '#/_helpers/i18n'
import { ROLE_LABEL_KEYS, ROLE_LEVELS, hasAtLeast } from '@/shared/utils/roles'

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

describe('shared/utils/roles — ROLE_LABEL_KEYS', () => {
  it('resolves to the role names in zh-CN and en-US', () => {
    const tZhCN = makeTranslator('zh-CN')
    const tEnUS = makeTranslator('en-US')
    expect(tZhCN(ROLE_LABEL_KEYS.admin)).toBe('管理员')
    expect(tZhCN(ROLE_LABEL_KEYS.author)).toBe('作者')
    expect(tZhCN(ROLE_LABEL_KEYS.visitor)).toBe('访客')
    expect(tEnUS(ROLE_LABEL_KEYS.admin)).toBe('Administrator')
  })
})
