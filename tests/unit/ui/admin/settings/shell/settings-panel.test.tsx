// @vitest-environment happy-dom

import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { SettingsFlushProvider, useSettingsFlushContext } from '@/ui/admin/settings/shell/SettingsFlushProvider'
import { SettingsPanel } from '@/ui/admin/settings/shell/SettingsPanel'

const logWarn = vi.hoisted(() => vi.fn())

vi.mock('@/client/lib/logger', () => ({
  getLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: logWarn,
    error: vi.fn(),
    child: vi.fn(),
    withScope: vi.fn(),
  }),
}))

// A cross-card transaction (the locale switch) must block EVERY edit in the
// workspace for its whole window: `inert` stops pointer and keyboard input
// while `aria-busy` announces the work. The provider restores focus after a
// failed transaction so the admin lands back on the control they used.

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((res) => {
    resolve = () => res()
  })
  return { promise, resolve }
}

function Harness({ task, focusAnchor }: { task: () => Promise<void>; focusAnchor?: HTMLElement | null }) {
  const { runTransaction, isTransactionPending } = useSettingsFlushContext()
  return (
    <SettingsPanel>
      <button
        type="button"
        onClick={() => {
          void runTransaction(task, focusAnchor).catch(() => {
            // The caller owns the rejection; this harness only drives the transaction.
          })
        }}
      >
        run
      </button>
      <input aria-label="other" />
      <output data-testid="pending">{String(isTransactionPending)}</output>
    </SettingsPanel>
  )
}

function renderHarness(task: () => Promise<void>, focusAnchor?: HTMLElement | null) {
  return render(
    <SettingsFlushProvider>
      <Harness task={task} focusAnchor={focusAnchor} />
    </SettingsFlushProvider>,
  )
}

describe('SettingsPanel + SettingsFlushProvider transactions', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('marks the whole workspace inert and aria-busy for the transaction window', async () => {
    const gate = deferred()
    renderHarness(() => gate.promise)

    fireEvent.click(screen.getByRole('button', { name: 'run' }))
    await waitFor(() => expect(screen.getByTestId('pending')).toHaveTextContent('true'))

    const pendingOutput = screen.getByTestId('pending')
    const workspace = pendingOutput.closest('[inert]')
    expect(workspace).not.toBeNull()
    expect(workspace).toHaveAttribute('aria-busy', 'true')
    // Every control lives inside the inert subtree — the browser blocks both
    // pointer and keyboard editing there.
    const input = screen.getByRole('textbox', { name: 'other' })
    expect(workspace!.contains(input)).toBe(true)
    expect(workspace!.contains(screen.getByRole('button', { name: 'run' }))).toBe(true)
    // Inert also refuses focus, so keyboard editing cannot start inside it.
    input.focus()
    expect(document.activeElement).not.toBe(input)

    await act(async () => {
      gate.resolve()
    })
    await waitFor(() => expect(screen.getByTestId('pending')).toHaveTextContent('false'))
    expect(document.querySelector('[inert]')).toBeNull()

    // Editable again, and the value survives.
    fireEvent.change(input, { target: { value: 'after' } })
    expect(input).toHaveValue('after')
  })

  it('stays pending until the outermost nested transaction settles', async () => {
    const outer = deferred()
    const inner = deferred()

    function Nested() {
      const { runTransaction, isTransactionPending } = useSettingsFlushContext()
      return (
        <SettingsPanel>
          <button
            type="button"
            onClick={() => {
              void runTransaction(async () => {
                await runTransaction(() => inner.promise)
                await outer.promise
              })
            }}
          >
            run
          </button>
          <output data-testid="pending">{String(isTransactionPending)}</output>
        </SettingsPanel>
      )
    }

    render(
      <SettingsFlushProvider>
        <Nested />
      </SettingsFlushProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'run' }))
    await waitFor(() => expect(screen.getByTestId('pending')).toHaveTextContent('true'))

    await act(async () => {
      inner.resolve()
    })
    // The inner task is done; the outer one still holds the workspace inert.
    expect(screen.getByTestId('pending')).toHaveTextContent('true')
    expect(document.querySelector('[inert]')).not.toBeNull()

    await act(async () => {
      outer.resolve()
    })
    await waitFor(() => expect(screen.getByTestId('pending')).toHaveTextContent('false'))
  })

  it('releases the workspace and restores focus when the transaction fails', async () => {
    const gate = deferred()
    renderHarness(async () => {
      await gate.promise
      throw new Error('vetoed')
    })

    const button = screen.getByRole('button', { name: 'run' })
    button.focus()
    expect(document.activeElement).toBe(button)

    fireEvent.click(button)
    await waitFor(() => expect(document.querySelector('[inert]')).not.toBeNull())
    // Browsers blur a focused element when its ancestor becomes inert.
    button.blur()
    expect(document.activeElement).not.toBe(button)

    await act(async () => {
      gate.resolve()
    })
    await waitFor(() => expect(screen.getByTestId('pending')).toHaveTextContent('false'))
    expect(document.querySelector('[inert]')).toBeNull()
    await waitFor(() => expect(document.activeElement).toBe(button))

    // The workspace is usable again.
    const input = screen.getByRole('textbox', { name: 'other' })
    fireEvent.change(input, { target: { value: 'resumed' } })
    expect(input).toHaveValue('resumed')
  })

  it('restores focus after a control disabled for the transaction is re-enabled', async () => {
    const gate = deferred()

    // Mirrors the locale switch: `busy` is a SEPARATE child state update that
    // clears a turn after `runTransaction` resolves, so focus can only be
    // restored once the deferral lets both renders commit.
    function TwoPhase() {
      const { runTransaction, isTransactionPending } = useSettingsFlushContext()
      const [busy, setBusy] = useState(false)
      return (
        <SettingsPanel>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setBusy(true)
              void runTransaction(() => gate.promise).finally(() => {
                setTimeout(() => setBusy(false), 0)
              })
            }}
          >
            run
          </button>
          <output data-testid="pending">{String(isTransactionPending)}</output>
        </SettingsPanel>
      )
    }

    render(
      <SettingsFlushProvider>
        <TwoPhase />
      </SettingsFlushProvider>,
    )

    const button = screen.getByRole('button', { name: 'run' })
    button.focus()
    fireEvent.click(button)
    await waitFor(() => expect(document.querySelector('[inert]')).not.toBeNull())
    button.blur()

    await act(async () => {
      gate.resolve()
    })
    await waitFor(() => expect(document.activeElement).toBe(button))
  })

  it('uses an explicit focus anchor when the previously focused portal option was removed', async () => {
    const anchor = document.createElement('button')
    anchor.textContent = 'anchor'
    document.body.append(anchor)
    const portalOption = document.createElement('button')
    portalOption.textContent = 'portal option'
    document.body.append(portalOption)
    portalOption.focus()

    const gate = deferred()
    renderHarness(() => gate.promise, anchor)
    fireEvent.click(screen.getByRole('button', { name: 'run' }))
    await waitFor(() => expect(document.querySelector('[inert]')).not.toBeNull())

    // The popup closed: the option unmounted, so an active-element anchor
    // would now be disconnected.
    portalOption.remove()
    expect(portalOption.isConnected).toBe(false)
    expect(document.activeElement).not.toBe(portalOption)

    await act(async () => {
      gate.resolve()
    })
    await waitFor(() => expect(document.activeElement).toBe(anchor))
    anchor.remove()
  })

  it('preserves an unconsumed focus anchor when the next transaction omits its own', async () => {
    const anchorA = document.createElement('button')
    anchorA.textContent = 'A'
    document.body.append(anchorA)
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur()
    }

    const frames: FrameRequestCallback[] = []
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      frames.push(callback)
      return frames.length
    })
    vi.stubGlobal('cancelAnimationFrame', () => {
      // The real cleanup cancels the frame; keep the callback so the test can
      // prove which anchor the surviving schedule consumed.
    })

    const { result } = renderHook(() => useSettingsFlushContext(), { wrapper: SettingsFlushProvider })

    const firstGate = deferred()
    let first!: Promise<void>
    await act(async () => {
      first = result.current.runTransaction(() => firstGate.promise, anchorA)
      await Promise.resolve()
    })
    // The first transaction settles; its restore frame is scheduled but has NOT
    // run yet, so the anchor is still unconsumed.
    await act(async () => {
      firstGate.resolve()
      await first
    })

    const secondGate = deferred()
    let second!: Promise<void>
    await act(async () => {
      // No explicit anchor: the unconsumed one is preserved.
      second = result.current.runTransaction(() => secondGate.promise)
      await Promise.resolve()
    })
    await act(async () => {
      secondGate.resolve()
      await second
    })

    expect(frames.length).toBeGreaterThan(0)
    await act(async () => {
      for (const frame of frames.splice(0)) {
        frame(0)
      }
    })
    expect(document.activeElement).toBe(anchorA)
    anchorA.remove()
  })

  it('lets an explicit null anchor cancel an unconsumed one from the previous transaction', async () => {
    const anchor = document.createElement('button')
    anchor.textContent = 'previous anchor'
    document.body.append(anchor)
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur()
    }
    expect(document.activeElement === null || document.activeElement === document.body).toBe(true)

    const frames: FrameRequestCallback[] = []
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      frames.push(callback)
      return frames.length
    })
    vi.stubGlobal('cancelAnimationFrame', () => {
      // Keep the cancelled callback so the test can prove it no longer restores.
    })

    const { result } = renderHook(() => useSettingsFlushContext(), { wrapper: SettingsFlushProvider })

    const firstGate = deferred()
    let first!: Promise<void>
    await act(async () => {
      first = result.current.runTransaction(() => firstGate.promise, anchor)
      await Promise.resolve()
    })
    await act(async () => {
      firstGate.resolve()
      await first
    })
    // The first restore frame is pending: its anchor is unconsumed.

    const secondGate = deferred()
    let second!: Promise<void>
    await act(async () => {
      // Explicit `null` wins over the unconsumed anchor.
      second = result.current.runTransaction(() => secondGate.promise, null)
      await Promise.resolve()
    })
    await act(async () => {
      secondGate.resolve()
      await second
    })

    await act(async () => {
      for (const frame of frames.splice(0)) {
        frame(0)
      }
    })
    // The stale anchor must never be re-focused.
    expect(document.activeElement === null || document.activeElement === document.body).toBe(true)
    expect(document.activeElement).not.toBe(anchor)
    anchor.remove()
  })

  it('logs and still runs a transaction when no provider is mounted', async () => {
    const { result } = renderHook(() => useSettingsFlushContext())
    let value = 0
    await act(async () => {
      value = await result.current.runTransaction(async () => 42)
    })
    expect(value).toBe(42)
    expect(logWarn).toHaveBeenCalledWith(
      'settings transaction ran without SettingsFlushProvider; workspace inert is disabled',
    )
  })
})
