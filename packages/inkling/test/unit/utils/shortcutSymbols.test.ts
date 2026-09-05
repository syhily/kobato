import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('shortcutSymbols', () => {
  const originalNavigator = globalThis.navigator

  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    Object.defineProperty(globalThis, 'navigator', {
      value: originalNavigator,
      configurable: true,
    })
  })

  it('returns mac symbols on macOS', async () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' },
      configurable: true,
    })

    const { ctrlOrCmdSymbol, ctrlOrSymbol, altOrOption } = await import('@/utils/shortcutSymbols')

    expect(ctrlOrCmdSymbol()).toBe('⌘')
    expect(ctrlOrSymbol()).toBe('⌃')
    expect(altOrOption()).toBe('⌥')
  })

  it('returns text labels on non-macOS', async () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
      configurable: true,
    })

    const { ctrlOrCmdSymbol, ctrlOrSymbol, altOrOption } = await import('@/utils/shortcutSymbols')

    expect(ctrlOrCmdSymbol()).toBe('Ctrl')
    expect(ctrlOrSymbol()).toBe('Ctrl')
    expect(altOrOption()).toBe('Alt')
  })
})
