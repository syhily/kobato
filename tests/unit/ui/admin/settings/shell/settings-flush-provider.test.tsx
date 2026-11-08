import { describe, expect, it, vi } from 'vitest'

import { renderToHtml } from '#/_helpers/render'
import { SettingsFlushProvider, useSettingsFlushContext } from '@/ui/admin/settings/shell/SettingsFlushProvider'

// `useEffect` never runs under renderToStaticMarkup, so only the
// SSR-reachable surface is tested here; effect-driven dispatch is
// covered by the card-level snapshot tests.

function CaptureContext({ onContext }: { onContext: (ctx: ReturnType<typeof useSettingsFlushContext>) => void }) {
  onContext(useSettingsFlushContext())
  return null
}

describe('ui/admin/settings/shell/SettingsFlushProvider', () => {
  it('exposes registerFlush, flushAll, flushSection through context', () => {
    let captured: ReturnType<typeof useSettingsFlushContext> | null = null
    renderToHtml(
      <SettingsFlushProvider>
        <CaptureContext
          onContext={(ctx) => {
            captured = ctx
          }}
        />
      </SettingsFlushProvider>,
    )
    expect(captured).not.toBeNull()
    expect(typeof captured!.registerFlush).toBe('function')
    expect(typeof captured!.flushAll).toBe('function')
    expect(typeof captured!.flushSection).toBe('function')
    expect(typeof captured!.flushAllAndWait).toBe('function')
  })

  it('default context (no provider) is inert — flushAll/flushSection are no-ops', () => {
    let captured: ReturnType<typeof useSettingsFlushContext> | null = null
    renderToHtml(
      <CaptureContext
        onContext={(ctx) => {
          captured = ctx
        }}
      />,
    )
    expect(captured).not.toBeNull()
    expect(() => {
      captured!.flushAll()
      captured!.flushSection('any')
      const unregister = captured!.registerFlush('general', vi.fn())
      unregister()
    }).not.toThrow()
  })

  it('registerFlush returns an unregister function', () => {
    let captured: ReturnType<typeof useSettingsFlushContext> | null = null
    renderToHtml(
      <SettingsFlushProvider>
        <CaptureContext
          onContext={(ctx) => {
            captured = ctx
          }}
        />
      </SettingsFlushProvider>,
    )
    const unregister = captured!.registerFlush('general', vi.fn())
    expect(typeof unregister).toBe('function')
    expect(() => unregister()).not.toThrow()
  })

  it('flushAllAndWait resolves true for an empty registry, and for clean cards', async () => {
    let captured: ReturnType<typeof useSettingsFlushContext> | null = null
    renderToHtml(
      <SettingsFlushProvider>
        <CaptureContext
          onContext={(ctx) => {
            captured = ctx
          }}
        />
      </SettingsFlushProvider>,
    )
    await expect(captured!.flushAllAndWait()).resolves.toBe(true)

    captured!.registerFlush('general', () => true)
    captured!.registerFlush('general', async () => true)
    await expect(captured!.flushAllAndWait()).resolves.toBe(true)
  })

  it('flushAllAndWait waits for every flush and is false when ANY card is not clean', async () => {
    let captured: ReturnType<typeof useSettingsFlushContext> | null = null
    renderToHtml(
      <SettingsFlushProvider>
        <CaptureContext
          onContext={(ctx) => {
            captured = ctx
          }}
        />
      </SettingsFlushProvider>,
    )

    let release!: (ok: boolean) => void
    const slow = new Promise<boolean>((resolve) => {
      release = resolve
    })
    const seen: string[] = []
    captured!.registerFlush('general', () => {
      seen.push('general')
      return true
    })
    captured!.registerFlush('comments', async () => {
      seen.push('comments')
      return slow
    })

    const waiting = captured!.flushAllAndWait()
    expect(seen).toHaveLength(2)
    release(false)
    await expect(waiting).resolves.toBe(false)

    // A throwing flush is a failure too — never an unhandled rejection.
    captured!.registerFlush('fonts', () => {
      throw new Error('boom')
    })
    const logWarn = vi.spyOn(await import('@/client/lib/logger').then((m) => m.getLogger('settings.flush')), 'warn')
    await expect(captured!.flushAllAndWait()).resolves.toBe(false)
    logWarn.mockRestore()
  })

  it('keeps the sync flushAll/flushSection fire-and-forget (no throw, no await)', () => {
    let captured: ReturnType<typeof useSettingsFlushContext> | null = null
    renderToHtml(
      <SettingsFlushProvider>
        <CaptureContext
          onContext={(ctx) => {
            captured = ctx
          }}
        />
      </SettingsFlushProvider>,
    )
    const asyncFlush = vi.fn(async () => false)
    captured!.registerFlush('general', asyncFlush)

    expect(() => captured!.flushAll()).not.toThrow()
    expect(() => captured!.flushSection('general')).not.toThrow()
    expect(asyncFlush).toHaveBeenCalled()
  })

  it('flushAll and flushSection do not throw on an empty registry', () => {
    let captured: ReturnType<typeof useSettingsFlushContext> | null = null
    renderToHtml(
      <SettingsFlushProvider>
        <CaptureContext
          onContext={(ctx) => {
            captured = ctx
          }}
        />
      </SettingsFlushProvider>,
    )
    // Registry is empty in SSR (no effect ran) — flush calls are no-ops.
    expect(() => {
      captured!.flushAll()
      captured!.flushSection('fonts')
    }).not.toThrow()
  })
})
