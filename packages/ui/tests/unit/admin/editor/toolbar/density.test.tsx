// @vitest-environment happy-dom

import { useToolbarDensityPreference } from '@kobato/editor/engine/toolbar/density'
import { act, renderHook } from '@testing-library/react'
import { hydrateRoot } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Audit P1-4: the lazy useState initializer read localStorage on the
// hydration render, so users WITH a stored preference got a hydration
// mismatch (SSR 'full' vs first client render 'compact'). The fix mirrors
// use-comment-guest: a useSyncExternalStore whose server snapshot is
// always the default. happy-dom doesn't implement localStorage, so stub
// the bare global the hook reads (same pattern as
// use-comment-guest-client.test.tsx).
const STORAGE_KEY = 'kobato/admin/page-editor/toolbar-density'

const store = new Map<string, string>()
vi.stubGlobal('localStorage', {
  getItem(key: string) {
    return store.get(key) ?? null
  },
  setItem(key: string, value: string) {
    store.set(key, value)
  },
  removeItem(key: string) {
    store.delete(key)
  },
  clear() {
    store.clear()
  },
} as unknown as Storage)

function Probe() {
  const [density] = useToolbarDensityPreference()
  return <span>{density}</span>
}

beforeEach(() => {
  store.clear()
})

describe('useToolbarDensityPreference — SSR/hydration consistency (audit P1-4)', () => {
  it('hard load: SSR emits the full default, hydration does not mismatch, and the stored preference lands afterwards', async () => {
    store.set(STORAGE_KEY, 'compact')
    const container = document.createElement('div')
    document.body.appendChild(container)

    // The server render sees the server snapshot — always the default,
    // regardless of the stored preference.
    container.innerHTML = renderToStaticMarkup(<Probe />)
    expect(container.textContent).toBe('full')

    const errors: unknown[][] = []
    const spy = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => errors.push(args))
    await act(async () => {
      hydrateRoot(container, <Probe />)
    })
    spy.mockRestore()

    // No hydration warning/error, and the stored preference applies once
    // React swaps to the client snapshot.
    expect(errors).toEqual([])
    expect(container.textContent).toBe('compact')
    container.remove()
  })

  it('prefills the stored preference immediately on SPA navigation (client-side mount)', () => {
    store.set(STORAGE_KEY, 'compact')
    const { result } = renderHook(() => useToolbarDensityPreference())
    expect(result.current[0]).toBe('compact')
  })

  it('defaults to full when nothing is stored, on server and client', () => {
    expect(renderToStaticMarkup(<Probe />)).toBe('<span>full</span>')
    const { result } = renderHook(() => useToolbarDensityPreference())
    expect(result.current[0]).toBe('full')
  })

  it('falls back to full on a malformed stored value', () => {
    store.set(STORAGE_KEY, 'huge')
    const { result } = renderHook(() => useToolbarDensityPreference())
    expect(result.current[0]).toBe('full')
  })
})

describe('useToolbarDensityPreference — setDensity', () => {
  it('updates the density and persists it to localStorage', () => {
    const { result } = renderHook(() => useToolbarDensityPreference())
    expect(result.current[0]).toBe('full')

    act(() => {
      result.current[1]('compact')
    })

    expect(result.current[0]).toBe('compact')
    expect(store.get(STORAGE_KEY)).toBe('compact')
  })

  it('keeps every mounted subscriber in sync through the shared store', () => {
    const first = renderHook(() => useToolbarDensityPreference())
    const second = renderHook(() => useToolbarDensityPreference())

    act(() => {
      first.result.current[1]('compact')
    })

    expect(first.result.current[0]).toBe('compact')
    expect(second.result.current[0]).toBe('compact')
  })
})
