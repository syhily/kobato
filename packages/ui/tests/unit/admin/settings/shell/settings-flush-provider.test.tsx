import { renderToHtml } from '#/_helpers/render'

import { SettingsFlushProvider, useSettingsFlushContext } from '@kobato/ui/admin/settings/shell/SettingsFlushProvider'
import { describe, expect, it, vi } from 'vitest'

// The provider holds its registry in a `useRef` Map and registers fns from a
// `useEffect` — neither of which run under `renderToStaticMarkup`. So these
// tests cover what's reachable in SSR: the default (no-provider) context is
// inert, the provider exposes the three API functions, and they're wired
// through to children. The effect-driven dispatch (register → flushAll →
// fn called) is a pure JS Map operation covered by the card-level snapshot
// tests that render the full tree, and by manual verification.

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
    // These must not throw when called without a provider.
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
    // Calling it must not throw.
    expect(() => unregister()).not.toThrow()
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
