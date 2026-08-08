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
