import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { SessionSortState } from '@/shared/utils/sessions-sort'

import { renderHook } from '#/_helpers/hook'
import { SESSION_SORT_OPTIONS } from '@/shared/utils/sessions-sort'
import { useSessionSort } from '@/ui/admin/sessions/useSessionSort'

const mock = vi.hoisted(() => ({
  setSearchParams: vi.fn(),
  useSearchParams: vi.fn(),
}))

mock.useSearchParams.mockImplementation(() => [new URLSearchParams(), mock.setSearchParams])

vi.mock('react-router', async () => {
  const actual = await vi.importActual<typeof import('react-router')>('react-router')
  return {
    ...actual,
    useSearchParams: mock.useSearchParams,
  }
})

describe('ui/admin/sessions/useSessionSort', () => {
  beforeEach(() => {
    mock.setSearchParams.mockClear()
    mock.useSearchParams.mockClear()
    mock.useSearchParams.mockImplementation(() => [new URLSearchParams(), mock.setSearchParams])
  })

  it('defaults to the first option', () => {
    const { sort } = renderHook(() => useSessionSort({ sortOptions: SESSION_SORT_OPTIONS }))
    expect(sort).toEqual({ field: 'lastActive', direction: 'desc' })
  })

  it('uses the provided default sort field', () => {
    const { sort } = renderHook(() => useSessionSort({ sortOptions: SESSION_SORT_OPTIONS, defaultSort: 'userName' }))
    expect(sort).toEqual({ field: 'userName', direction: 'asc' })
  })

  it('parses a sort param with default direction', () => {
    mock.useSearchParams.mockReturnValueOnce([new URLSearchParams({ sort: 'loginTime' }), mock.setSearchParams])
    const { sort } = renderHook(() => useSessionSort({ sortOptions: SESSION_SORT_OPTIONS }))
    expect(sort).toEqual({ field: 'loginTime', direction: 'desc' })
  })

  it('parses a reversed sort param', () => {
    mock.useSearchParams.mockReturnValueOnce([new URLSearchParams({ sort: '-lastActive' }), mock.setSearchParams])
    const { sort } = renderHook(() => useSessionSort({ sortOptions: SESSION_SORT_OPTIONS }))
    expect(sort).toEqual({ field: 'lastActive', direction: 'asc' })
  })

  it('falls back to default for an unknown sort param', () => {
    mock.useSearchParams.mockReturnValueOnce([new URLSearchParams({ sort: 'unknown' }), mock.setSearchParams])
    const { sort } = renderHook(() => useSessionSort({ sortOptions: SESSION_SORT_OPTIONS }))
    expect(sort).toEqual({ field: 'lastActive', direction: 'desc' })
  })

  it('setSort removes the param when matching the default', () => {
    const { setSort } = renderHook(() => useSessionSort({ sortOptions: SESSION_SORT_OPTIONS }))
    const next: SessionSortState = { field: 'lastActive', direction: 'desc' }
    setSort(next)
    expect(mock.setSearchParams).toHaveBeenCalledTimes(1)
    const [params] = mock.setSearchParams.mock.calls[0]!
    expect(params).toBeInstanceOf(URLSearchParams)
    expect(params.get('sort')).toBeNull()
  })

  it('setSort writes the serialized reverse direction', () => {
    const { setSort } = renderHook(() => useSessionSort({ sortOptions: SESSION_SORT_OPTIONS }))
    const next: SessionSortState = { field: 'lastActive', direction: 'asc' }
    setSort(next)
    const [params] = mock.setSearchParams.mock.calls[0]!
    expect(params.get('sort')).toBe('-lastActive')
  })

  it('setSort writes a non-default field without a prefix', () => {
    const { setSort } = renderHook(() => useSessionSort({ sortOptions: SESSION_SORT_OPTIONS }))
    const next: SessionSortState = { field: 'userName', direction: 'asc' }
    setSort(next)
    const [params] = mock.setSearchParams.mock.calls[0]!
    expect(params.get('sort')).toBe('userName')
  })

  it('passes replace=false so navigation stays in history', () => {
    const { setSort } = renderHook(() => useSessionSort({ sortOptions: SESSION_SORT_OPTIONS }))
    setSort({ field: 'userName', direction: 'desc' })
    expect(mock.setSearchParams).toHaveBeenCalledWith(expect.any(URLSearchParams), { replace: false })
  })
})
