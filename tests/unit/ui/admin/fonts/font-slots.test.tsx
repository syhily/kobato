// @vitest-environment happy-dom

import type { ReactNode } from 'react'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { FontsSettings } from '@/shared/config/types'

// Hoisted singletons let each test swap the loader snapshot and the
// mutation outcome; the orpcQuery key grammar is pinned by fonts-cache.test.ts.
const routerState = vi.hoisted(() => ({
  fonts: undefined as FontsSettings | undefined,
  revalidate: vi.fn(),
}))

vi.mock('react-router', async () => {
  const actual = await vi.importActual<typeof import('react-router')>('react-router')
  return {
    ...actual,
    useRouteLoaderData: () => (routerState.fonts === undefined ? null : { blogSettings: { fonts: routerState.fonts } }),
    useRevalidator: () => ({ revalidate: routerState.revalidate }),
  }
})

const setSlotMock = vi.hoisted(() => vi.fn())

vi.mock('@/client/api/client', () => ({
  orpc: { admin: { fonts: { setSlot: setSlotMock } } },
}))

vi.mock('@/client/api/orpc-query', () => ({
  orpcQuery: { admin: { fonts: { list: { key: () => ['admin', 'fonts', 'list'] } } } },
}))

const toastMock = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }))
vi.mock('sonner', () => ({ toast: toastMock }))

import { type SlotState, slotsReducer, useFontSlotsController } from '@/ui/admin/fonts/font-slots'

function makeFonts(slots: Partial<Pick<FontsSettings, 'global' | 'post' | 'code'>>): FontsSettings {
  return {
    og: { family: '' },
    calendar: { family: '' },
    global: slots.global ?? [],
    post: slots.post ?? [],
    code: slots.code ?? [],
  }
}

describe('slotsReducer', () => {
  const base: SlotState = { global: ['a', 'b'], post: ['c'], code: [] }

  it('seeded replaces the whole state', () => {
    const next: SlotState = { global: ['x'], post: [], code: ['y'] }
    expect(slotsReducer(base, { type: 'seeded', slots: next })).toBe(next)
  })

  it('setSlot replaces one slot and preserves the others', () => {
    expect(slotsReducer(base, { type: 'setSlot', slot: 'global', ids: ['b', 'a'] })).toEqual({
      global: ['b', 'a'],
      post: ['c'],
      code: [],
    })
  })

  it('reorder moves an id within its slot', () => {
    expect(slotsReducer(base, { type: 'reorder', slot: 'global', from: 0, to: 1 })).toEqual({
      global: ['b', 'a'],
      post: ['c'],
      code: [],
    })
  })

  it('move appends to the target slot when the index is undefined', () => {
    expect(slotsReducer(base, { type: 'move', fontId: 'x', target: 'post', index: undefined }).post).toEqual(['c', 'x'])
  })

  it('move inserts at the given index', () => {
    expect(slotsReducer(base, { type: 'move', fontId: 'x', target: 'post', index: 0 }).post).toEqual(['x', 'c'])
  })

  it('move clamps an out-of-range index to the end', () => {
    expect(slotsReducer(base, { type: 'move', fontId: 'x', target: 'post', index: 99 }).post).toEqual(['c', 'x'])
  })

  it('move dedupes an id already present in the target slot', () => {
    expect(slotsReducer(base, { type: 'move', fontId: 'a', target: 'global', index: 2 }).global).toEqual(['b', 'a'])
  })

  it('move removes the id from the source slot on a cross-slot move', () => {
    const next = slotsReducer(base, { type: 'move', fontId: 'a', target: 'post', index: undefined, from: 'global' })
    expect(next.global).toEqual(['b'])
    expect(next.post).toEqual(['c', 'a'])
  })

  it('move with from === target repositions within the one slot', () => {
    const next = slotsReducer(base, { type: 'move', fontId: 'a', target: 'global', index: 2, from: 'global' })
    expect(next.global).toEqual(['b', 'a'])
    expect(next.post).toEqual(['c'])
  })

  it('remove filters the id from the given slot only', () => {
    expect(slotsReducer(base, { type: 'remove', slot: 'global', fontId: 'a' })).toEqual({
      global: ['b'],
      post: ['c'],
      code: [],
    })
  })

  it('does not mutate the input state', () => {
    const frozen: SlotState = { global: ['a', 'b'], post: ['c'], code: [] }
    const snapshot = structuredClone(frozen)
    slotsReducer(frozen, { type: 'move', fontId: 'a', target: 'post', index: 0, from: 'global' })
    slotsReducer(frozen, { type: 'remove', slot: 'global', fontId: 'a' })
    expect(frozen).toEqual(snapshot)
  })
})

describe('useFontSlotsController', () => {
  function makeWrapper() {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    return function Wrapper({ children }: { children: ReactNode }) {
      return <QueryClientProvider client={client}>{children}</QueryClientProvider>
    }
  }

  beforeEach(() => {
    vi.clearAllMocks()
    routerState.fonts = undefined
    setSlotMock.mockReset()
    setSlotMock.mockResolvedValue({})
  })

  it('seeds the slots from the root loader settings', () => {
    routerState.fonts = makeFonts({ global: ['a'], post: ['b'] })
    const { result } = renderHook(() => useFontSlotsController(), { wrapper: makeWrapper() })
    expect(result.current.slots).toEqual({ global: ['a'], post: ['b'], code: [] })
  })

  it('reseeds when the loader data changes while idle', () => {
    routerState.fonts = makeFonts({ global: ['a'] })
    const { result, rerender } = renderHook(() => useFontSlotsController(), { wrapper: makeWrapper() })
    routerState.fonts = makeFonts({ global: ['a', 'b'] })
    rerender()
    expect(result.current.slots.global).toEqual(['a', 'b'])
  })

  it('skips the reseed while a setSlot mutation is in flight, then seeds again once it settles', async () => {
    let resolveSetSlot!: (value: unknown) => void
    setSlotMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSetSlot = resolve
        }),
    )
    routerState.fonts = makeFonts({ global: ['a'] })
    const { result, rerender } = renderHook(() => useFontSlotsController(), { wrapper: makeWrapper() })

    await act(async () => {
      result.current.moveToSlot('x', 'global', undefined)
    })
    expect(result.current.slots.global).toEqual(['a', 'x'])

    // Mid-flight loader data must not clobber the optimistic state.
    routerState.fonts = makeFonts({ global: ['a'] })
    rerender()
    expect(result.current.slots.global).toEqual(['a', 'x'])

    await act(async () => {
      resolveSetSlot({})
    })
    routerState.fonts = makeFonts({ global: ['a', 'x', 'y'] })
    rerender()
    expect(result.current.slots.global).toEqual(['a', 'x', 'y'])
  })

  it('releases the guard and reseeds after a failed mutation', async () => {
    let rejectSetSlot!: (err: unknown) => void
    setSlotMock.mockImplementation(
      () =>
        new Promise((_, reject) => {
          rejectSetSlot = reject
        }),
    )
    routerState.fonts = makeFonts({ global: ['a'] })
    const { result, rerender } = renderHook(() => useFontSlotsController(), { wrapper: makeWrapper() })

    await act(async () => {
      result.current.moveToSlot('x', 'global', undefined)
    })
    expect(result.current.slots.global).toEqual(['a', 'x'])

    await act(async () => {
      rejectSetSlot(new Error('boom'))
    })
    expect(toastMock.error).toHaveBeenCalledWith('槽位更新失败', expect.anything())

    routerState.fonts = makeFonts({ global: ['a'] })
    rerender()
    expect(result.current.slots.global).toEqual(['a'])
  })

  it('serializes rapid persists so the server receives them in dispatch order (audit P1-19)', async () => {
    const calls: { slot: string; fontIds: string[] }[] = []
    const resolvers: (() => void)[] = []
    setSlotMock.mockImplementation((args: { slot: string; fontIds: string[] }) => {
      calls.push(args)
      return new Promise((resolve) => {
        resolvers.push(() => resolve({}))
      })
    })
    routerState.fonts = makeFonts({ global: ['a', 'b', 'c'] })
    const { result } = renderHook(() => useFontSlotsController(), { wrapper: makeWrapper() })

    // Two rapid drag-ends fire from the latest optimistic state.
    await act(async () => {
      result.current.reorder('global', 0, 2)
    })
    expect(result.current.slots.global).toEqual(['b', 'c', 'a'])
    await act(async () => {
      result.current.reorder('global', 0, 1)
    })
    expect(result.current.slots.global).toEqual(['c', 'b', 'a'])

    // No second POST while the first persist is in flight.
    expect(calls).toEqual([{ slot: 'global', fontIds: ['b', 'c', 'a'] }])

    // Once the first settles, the queued second fires — the last drag wins.
    await act(async () => {
      resolvers[0]!()
    })
    expect(calls).toEqual([
      { slot: 'global', fontIds: ['b', 'c', 'a'] },
      { slot: 'global', fontIds: ['c', 'b', 'a'] },
    ])
  })

  it('a failed persist does not strand the queue — the next drag still goes out', async () => {
    const calls: { slot: string; fontIds: string[] }[] = []
    const rejecters: (() => void)[] = []
    setSlotMock.mockImplementation((args: { slot: string; fontIds: string[] }) => {
      calls.push(args)
      if (calls.length === 1) {
        return new Promise((_, reject) => {
          rejecters.push(() => reject(new Error('boom')))
        })
      }
      return Promise.resolve({})
    })
    routerState.fonts = makeFonts({ global: ['a', 'b'] })
    const { result } = renderHook(() => useFontSlotsController(), { wrapper: makeWrapper() })

    await act(async () => {
      result.current.reorder('global', 0, 1)
    })
    await act(async () => {
      rejecters[0]!()
    })
    expect(toastMock.error).toHaveBeenCalledWith('槽位更新失败', expect.anything())

    await act(async () => {
      result.current.remove('global', 'a')
    })
    expect(calls).toEqual([
      { slot: 'global', fontIds: ['b', 'a'] },
      { slot: 'global', fontIds: ['b'] },
    ])
  })

  it('persists both slots on a cross-slot move', async () => {
    routerState.fonts = makeFonts({ global: ['a'], post: ['b'] })
    const { result } = renderHook(() => useFontSlotsController(), { wrapper: makeWrapper() })
    await act(async () => {
      result.current.moveToSlot('a', 'post', undefined, 'global')
    })
    expect(result.current.slots).toEqual({ global: [], post: ['b', 'a'], code: [] })
    expect(setSlotMock).toHaveBeenCalledWith({ slot: 'global', fontIds: [] })
    expect(setSlotMock).toHaveBeenCalledWith({ slot: 'post', fontIds: ['b', 'a'] })
  })

  it('rejects a duplicate move with a toast and does not persist', () => {
    routerState.fonts = makeFonts({ global: ['a'] })
    const { result } = renderHook(() => useFontSlotsController(), { wrapper: makeWrapper() })
    act(() => {
      result.current.moveToSlot('a', 'global', undefined)
    })
    expect(toastMock.error).toHaveBeenCalledWith('该字体已在目标槽位中')
    expect(setSlotMock).not.toHaveBeenCalled()
    expect(result.current.slots.global).toEqual(['a'])
  })

  it('rejects moves beyond the slot cap', () => {
    routerState.fonts = makeFonts({ global: ['1', '2', '3', '4', '5', '6', '7', '8'] })
    const { result } = renderHook(() => useFontSlotsController(), { wrapper: makeWrapper() })
    act(() => {
      result.current.moveToSlot('9', 'global', undefined)
    })
    expect(toastMock.error).toHaveBeenCalledWith('每个槽位最多 8 个字体')
    expect(setSlotMock).not.toHaveBeenCalled()
  })

  it('reorder commits and persists the new order', async () => {
    routerState.fonts = makeFonts({ global: ['a', 'b'] })
    const { result } = renderHook(() => useFontSlotsController(), { wrapper: makeWrapper() })
    await act(async () => {
      result.current.reorder('global', 0, 1)
    })
    expect(result.current.slots.global).toEqual(['b', 'a'])
    expect(setSlotMock).toHaveBeenCalledWith({ slot: 'global', fontIds: ['b', 'a'] })
  })

  it('remove filters the id and persists', async () => {
    routerState.fonts = makeFonts({ global: ['a', 'b'] })
    const { result } = renderHook(() => useFontSlotsController(), { wrapper: makeWrapper() })
    await act(async () => {
      result.current.remove('global', 'a')
    })
    expect(result.current.slots.global).toEqual(['b'])
    expect(setSlotMock).toHaveBeenCalledWith({ slot: 'global', fontIds: ['b'] })
  })
})
