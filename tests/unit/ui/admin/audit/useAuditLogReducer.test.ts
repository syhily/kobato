import { describe, expect, it } from 'vitest'

import { auditLogReducer, findActorLabel } from '@/ui/admin/audit/useAuditLogReducer'

const initialState = {
  items: [],
  total: 0,
  hasMore: false,
  filters: [],
}

const makeItem = (id: string) =>
  ({
    id,
    action: 'login',
    resourceType: 'session',
    actorId: null,
    actorName: null,
    actorRole: null,
    resourceId: null,
    details: null,
    detailsHtml: null,
    ipAddressMasked: null,
    userAgentMasked: null,
    createdAt: '2026-01-01T00:00:00.000Z',
  }) as const

describe('auditLogReducer', () => {
  it('loads items and replaces the existing list', () => {
    const next = auditLogReducer(initialState, {
      type: 'loaded',
      items: [makeItem('1'), makeItem('2')],
      total: 2,
      hasMore: false,
    })
    expect(next.items).toHaveLength(2)
    expect(next.total).toBe(2)
    expect(next.hasMore).toBe(false)
  })

  it('appends items and updates total/hasMore', () => {
    const state = auditLogReducer(initialState, {
      type: 'loaded',
      items: [makeItem('1')],
      total: 3,
      hasMore: true,
    })
    const next = auditLogReducer(state, {
      type: 'appended',
      items: [makeItem('2'), makeItem('3')],
      total: 3,
      hasMore: false,
    })
    expect(next.items).toHaveLength(3)
    expect(next.total).toBe(3)
    expect(next.hasMore).toBe(false)
  })

  it('adds a filter', () => {
    const next = auditLogReducer(initialState, {
      type: 'addFilter',
      field: 'action',
      value: 'login',
      label: '登录',
    })
    expect(next.filters).toEqual([{ field: 'action', value: 'login', label: '登录' }])
  })

  it('replaces an existing filter with the same field', () => {
    const state = auditLogReducer(initialState, {
      type: 'addFilter',
      field: 'action',
      value: 'login',
      label: '登录',
    })
    const next = auditLogReducer(state, {
      type: 'addFilter',
      field: 'action',
      value: 'logout',
      label: '登出',
    })
    expect(next.filters).toEqual([{ field: 'action', value: 'logout', label: '登出' }])
  })

  it('keeps filters for other fields when replacing one', () => {
    const state = auditLogReducer(initialState, {
      type: 'addFilter',
      field: 'action',
      value: 'login',
      label: '登录',
    })
    const withResource = auditLogReducer(state, {
      type: 'addFilter',
      field: 'resourceType',
      value: 'session',
      label: '会话',
    })
    const next = auditLogReducer(withResource, {
      type: 'addFilter',
      field: 'action',
      value: 'logout',
      label: '登出',
    })
    expect(next.filters).toEqual([
      { field: 'resourceType', value: 'session', label: '会话' },
      { field: 'action', value: 'logout', label: '登出' },
    ])
  })

  it('removes a filter by field', () => {
    const state = auditLogReducer(initialState, {
      type: 'addFilter',
      field: 'action',
      value: 'login',
      label: '登录',
    })
    const next = auditLogReducer(state, { type: 'removeFilter', field: 'action' })
    expect(next.filters).toEqual([])
  })

  it('renames a filter label', () => {
    const state = auditLogReducer(initialState, {
      type: 'addFilter',
      field: 'action',
      value: 'login',
      label: '登录',
    })
    const next = auditLogReducer(state, {
      type: 'renameFilter',
      field: 'action',
      label: '登录（已选）',
    })
    expect(next.filters[0]!.label).toBe('登录（已选）')
  })

  it('ignores rename when the field does not exist', () => {
    const next = auditLogReducer(initialState, {
      type: 'renameFilter',
      field: 'action',
      label: '登录',
    })
    expect(next).toBe(initialState)
  })

  it('clears all filters', () => {
    const state = auditLogReducer(initialState, {
      type: 'addFilter',
      field: 'action',
      value: 'login',
      label: '登录',
    })
    const next = auditLogReducer(state, { type: 'clearFilters' })
    expect(next.filters).toEqual([])
  })
})

describe('findActorLabel', () => {
  it('returns empty string when actorId is empty', () => {
    expect(findActorLabel(undefined, '')).toBe('')
  })

  it('prefers email over actorName', () => {
    const actors = [{ actorId: '1', actorName: 'Alice', email: 'alice@example.com' }]
    expect(findActorLabel(actors, '1')).toBe('alice@example.com')
  })

  it('returns empty string when actor email is empty', () => {
    const actors = [{ actorId: '2', actorName: 'Bob', email: '' }]
    expect(findActorLabel(actors, '2')).toBe('')
  })

  it('falls back to actorId when no actor matches', () => {
    expect(findActorLabel([], '3')).toBe('3')
  })
})
