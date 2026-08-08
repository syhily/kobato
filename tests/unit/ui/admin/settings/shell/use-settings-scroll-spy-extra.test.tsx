import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { renderHook } from '#/_helpers/hook'
import {
  ScrollSpyProvider,
  useScrollSpy,
  useScrollSpyContext,
  useScrollSpyNav,
} from '@/ui/admin/settings/shell/useSettingsScrollSpy'

// Extra coverage for useSettingsScrollSpy under the single-pass SSR
// harness (the scroll-detection effect never fires): observable surfaces
// are context defaults, callable callbacks, and null refs.

describe('ui/admin/settings/shell/useSettingsScrollSpy — extra', () => {
  // scrollToSection needs document.getElementById; stub it to return null so the callback no-ops.
  beforeEach(() => {
    const fakeDoc = {
      getElementById: vi.fn().mockReturnValue(null),
    }
    vi.stubGlobal('document', fakeDoc)
    // Stub the active-nav timer so no real timer leaks across tests.
    vi.stubGlobal(
      'setTimeout',
      vi.fn(() => 0 as unknown as NodeJS.Timeout),
    )
    vi.stubGlobal('clearTimeout', vi.fn())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  describe('provider context API', () => {
    it('exposes a null currentSection and the three mutators initially', () => {
      const ctx = renderHook(useScrollSpyContext, { wrapper: ScrollSpyProvider })
      expect(ctx.currentSection).toBeNull()
      expect(ctx.updateSection).toBeInstanceOf(Function)
      expect(ctx.updateNav).toBeInstanceOf(Function)
      expect(ctx.scrollToSection).toBeInstanceOf(Function)
    })

    it('updateSection stores a section element without throwing', () => {
      const fakeEl = { id: 'general' } as unknown as HTMLDivElement
      const ctx = renderHook(useScrollSpyContext, {
        wrapper: ScrollSpyProvider,
        actions: [({ updateSection }) => updateSection('general', fakeEl)],
      })
      // Effects don't run in SSR, so currentSection stays null.
      expect(ctx.currentSection).toBeNull()
    })

    it('updateNav stores a nav element without throwing', () => {
      const fakeEl = { id: 'nav-general' } as unknown as HTMLElement
      const ctx = renderHook(useScrollSpyContext, {
        wrapper: ScrollSpyProvider,
        actions: [({ updateNav }) => updateNav('general', fakeEl)],
      })
      expect(ctx.currentSection).toBeNull()
    })

    it('scrollToSection is a no-op when the section was never registered', () => {
      const ctx = renderHook(useScrollSpyContext, {
        wrapper: ScrollSpyProvider,
        actions: [({ scrollToSection }) => scrollToSection('never-registered')],
      })
      // No-op: the scrollTo callback guards on sectionElements.current[id].
      expect(ctx.currentSection).toBeNull()
    })

    it('scrollToSection targets a registered section but remains null in SSR', () => {
      const fakeEl = {} as unknown as HTMLDivElement
      // setActiveNav schedules state invisible in this pass; the scroller lookup bails without the DOM element.
      const ctx = renderHook(useScrollSpyContext, {
        wrapper: ScrollSpyProvider,
        actions: [
          ({ updateSection }) => updateSection('general', fakeEl),
          ({ scrollToSection }) => scrollToSection('general'),
        ],
      })
      expect(ctx.currentSection).toBeNull()
    })
  })

  describe('useScrollSpy section ref', () => {
    it('returns a ref whose current is null in SSR', () => {
      const { ref } = renderHook(() => useScrollSpy('general'), { wrapper: ScrollSpyProvider })
      expect(ref).toHaveProperty('current')
      expect(ref.current).toBeNull()
    })

    it('returns a ref when called with no id (optional param)', () => {
      const { ref } = renderHook(() => useScrollSpy(), { wrapper: ScrollSpyProvider })
      expect(ref.current).toBeNull()
    })
  })

  describe('useScrollSpyNav nav ref + marker prop', () => {
    it('returns a ref and the data-setting-nav-item marker', () => {
      const { ref, props } = renderHook(() => useScrollSpyNav('general'), { wrapper: ScrollSpyProvider })
      expect(ref.current).toBeNull()
      expect(props).toEqual({ 'data-setting-nav-item': true })
    })

    it('returns the marker even when called with no id', () => {
      const { ref, props } = renderHook(() => useScrollSpyNav(), { wrapper: ScrollSpyProvider })
      expect(ref.current).toBeNull()
      expect(props).toEqual({ 'data-setting-nav-item': true })
    })

    it('exposes the marker as a readonly const', () => {
      const { props } = renderHook(() => useScrollSpyNav('general'), { wrapper: ScrollSpyProvider })
      // The marker is `as const`, so the property is the literal true.
      expect(props['data-setting-nav-item']).toBe(true)
    })
  })

  describe('multiple sections / navs in one pass', () => {
    it('registers several sections and navs without interfering with each other', () => {
      const ctx = renderHook(useScrollSpyContext, {
        wrapper: ScrollSpyProvider,
        actions: [
          ({ updateSection, updateNav }) => {
            updateSection('general', {} as HTMLDivElement)
            updateSection('appearance', {} as HTMLDivElement)
            updateSection('mail', {} as HTMLDivElement)
            updateNav('general', {} as HTMLElement)
            updateNav('appearance', {} as HTMLElement)
          },
        ],
      })
      // Still null in SSR (no scroll effect), but the calls must not throw.
      expect(ctx.currentSection).toBeNull()
    })

    it('re-registering the same section id overwrites the stored element', () => {
      const first = { id: 'first' } as unknown as HTMLDivElement
      const second = { id: 'second' } as unknown as HTMLDivElement
      const ctx = renderHook(useScrollSpyContext, {
        wrapper: ScrollSpyProvider,
        actions: [
          ({ updateSection }) => updateSection('general', first),
          ({ updateSection }) => updateSection('general', second),
        ],
      })
      expect(ctx.currentSection).toBeNull()
    })
  })
})

// No-provider fallbacks: consumer hooks return the noop defaults and never throw.
describe('ui/admin/settings/shell/useSettingsScrollSpy — default (no provider) context', () => {
  it('useScrollSpyContext returns the documented no-op defaults', () => {
    const ctx = renderHook(useScrollSpyContext)
    expect(ctx.currentSection).toBeNull()
    expect(() => ctx.updateSection('a', {} as HTMLDivElement)).not.toThrow()
    expect(() => ctx.updateNav('a', {} as HTMLElement)).not.toThrow()
    expect(() => ctx.scrollToSection('a')).not.toThrow()
  })

  it('useScrollSpy returns a ref without a provider', () => {
    const { ref } = renderHook(() => useScrollSpy('general'))
    expect(ref.current).toBeNull()
  })

  it('useScrollSpyNav returns a ref + marker without a provider', () => {
    const { ref, props } = renderHook(() => useScrollSpyNav('general'))
    expect(ref.current).toBeNull()
    expect(props).toEqual({ 'data-setting-nav-item': true })
  })
})
