// @vitest-environment happy-dom

import { useChromeClock } from '@kobato/ui/public/chrome/use-chrome-clock'
import { act, render } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The stale instant the root loader baked at request time (V3-08).
const LOADER_NOW = '2026-07-31T23:59:00.000Z'
// The live client clock — already past the loader's instant.
const CLIENT_NOW = '2026-08-01T00:30:00.000Z'

// Mounts the hook under a memory router whose root route carries the
// loader's `nowIso`, recording every rendered value.
function setup() {
  const renders: string[] = []
  function Harness() {
    renders.push(useChromeClock().toISOString())
    return null
  }
  const router = createMemoryRouter(
    [{ id: 'root', path: '*', loader: () => ({ nowIso: LOADER_NOW }), element: <Harness /> }],
    { initialEntries: ['/'] },
  )
  render(<RouterProvider router={router} />)
  return { renders }
}

describe('useChromeClock', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date(CLIENT_NOW) })
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders the loader clock first (SSR/hydration parity), then switches to the live client clock after mount', async () => {
    const { renders } = setup()
    await act(async () => {})

    // First paint must match the server-rendered instant (P2-23)…
    expect(renders[0]).toBe(LOADER_NOW)
    // …and once mounted, the stale loader value is replaced by the client clock.
    expect(renders.at(-1)).toBe(CLIENT_NOW)
  })

  it('refreshes the client clock every minute so a long-lived tab rolls over', async () => {
    const { renders } = setup()
    await act(async () => {})

    act(() => vi.advanceTimersByTime(60_000))

    expect(renders.at(-1)).toBe('2026-08-01T00:31:00.000Z')
  })
})
