import {
  DEFAULT_ADMIN_SORT,
  DEFAULT_MY_SORT,
  MY_SESSION_SORT_OPTIONS,
  SESSION_SORT_OPTIONS,
  parseSessionSort,
  serializeSessionSort,
} from '@kobato/shared/utils/sessions-sort'
import { describe, expect, it } from 'vitest'

describe('parseSessionSort', () => {
  it('returns default sort when raw is null', () => {
    const result = parseSessionSort(null, SESSION_SORT_OPTIONS, DEFAULT_ADMIN_SORT)
    expect(result).toEqual({ field: 'lastActive', direction: 'desc' })
  })

  it('returns default sort when raw is empty', () => {
    const result = parseSessionSort('', SESSION_SORT_OPTIONS, DEFAULT_ADMIN_SORT)
    expect(result).toEqual({ field: 'lastActive', direction: 'desc' })
  })

  it('parses field with default direction', () => {
    const result = parseSessionSort('loginTime', SESSION_SORT_OPTIONS, DEFAULT_ADMIN_SORT)
    expect(result).toEqual({ field: 'loginTime', direction: 'desc' })
  })

  it('parses userName with default asc direction', () => {
    const result = parseSessionSort('userName', SESSION_SORT_OPTIONS, DEFAULT_ADMIN_SORT)
    expect(result).toEqual({ field: 'userName', direction: 'asc' })
  })

  it('parses reversed field when default is desc', () => {
    const result = parseSessionSort('-lastActive', SESSION_SORT_OPTIONS, DEFAULT_ADMIN_SORT)
    expect(result).toEqual({ field: 'lastActive', direction: 'asc' })
  })

  it('parses reversed field when default is asc', () => {
    const result = parseSessionSort('-userName', SESSION_SORT_OPTIONS, DEFAULT_ADMIN_SORT)
    expect(result).toEqual({ field: 'userName', direction: 'desc' })
  })

  it('falls back to default on unknown field', () => {
    const result = parseSessionSort('unknown', SESSION_SORT_OPTIONS, DEFAULT_ADMIN_SORT)
    expect(result).toEqual({ field: 'lastActive', direction: 'desc' })
  })

  it('falls back to default on unknown reversed field', () => {
    const result = parseSessionSort('-unknown', SESSION_SORT_OPTIONS, DEFAULT_ADMIN_SORT)
    expect(result).toEqual({ field: 'lastActive', direction: 'desc' })
  })

  it('works with my session options', () => {
    const result = parseSessionSort('loginTime', MY_SESSION_SORT_OPTIONS, DEFAULT_MY_SORT)
    expect(result).toEqual({ field: 'loginTime', direction: 'desc' })
  })
})

describe('serializeSessionSort', () => {
  it('serializes default direction as plain field', () => {
    expect(serializeSessionSort({ field: 'lastActive', direction: 'desc' }, SESSION_SORT_OPTIONS)).toBe('lastActive')
  })

  it('serializes reversed direction with minus prefix', () => {
    expect(serializeSessionSort({ field: 'lastActive', direction: 'asc' }, SESSION_SORT_OPTIONS)).toBe('-lastActive')
  })

  it('serializes userName asc as plain field', () => {
    expect(serializeSessionSort({ field: 'userName', direction: 'asc' }, SESSION_SORT_OPTIONS)).toBe('userName')
  })

  it('serializes userName desc with minus prefix', () => {
    expect(serializeSessionSort({ field: 'userName', direction: 'desc' }, SESSION_SORT_OPTIONS)).toBe('-userName')
  })

  it('serializes unknown field as plain field', () => {
    expect(serializeSessionSort({ field: 'unknown' as 'lastActive', direction: 'desc' }, SESSION_SORT_OPTIONS)).toBe(
      'unknown',
    )
  })
})
