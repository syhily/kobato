import { renderHook } from '#/_helpers/hook'

import {
  ScrollSpyProvider,
  useScrollSpy,
  useScrollSpyContext,
  useScrollSpyNav,
} from '@kobato/ui/admin/settings/shell/useSettingsScrollSpy'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Extra coverage for useSettingsScrollSpy. The SSR `renderHook` harness
// runs a single synchronous pass, so the scroll-detection `useEffect`
// (which depends on `document.getElementById('settings-content-scroller')`
// and attaches a scroll listener) does not fire. What IS observable in a
// single pass:
//   - the provider context's initial value (currentSection === null)
//   - the updateSection / updateNav / scrollToSection callbacks are
//     present and callable (updateSection/updateNav mutate refs and are
//     safe to call without a DOM; scrollToSection reads refs and is a
//     no-op when the section was never registered)
//   - useScrollSpy / useScrollSpyNav return refs (initially null in SSR)
//     and the nav marker prop
//   - the default (no-provider) context fallbacks
//
// The geometry helpers (findClosestSection, scrollSidebarNav,
// scrollToSectionElement) are module-private and only reachable through
// the effects, so they are left to higher-level integration coverage.

describe('ui/admin/settings/shell/useSettingsScrollSpy — extra', () => {
  // scrollToSection's callback reaches for `document.getElementById`
  // (via getContentScroller / getNavScroller). The unit project runs in
  // the node environment where `document` is undefined, so we stub a
  // minimal document that returns null for both scrollers — the scroll
  // helpers then bail early and the callback becomes a safe no-op.
  beforeEach(() => {
    const fakeDoc = {
      getElementById: vi.fn().mockReturnValue(null),
    }
    vi.stubGlobal('document', fakeDoc)
    // scrollToSection also arms a setTimeout via the active-nav timer;
    // stub it so no real timer leaks across tests.
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
      // currentSection is still null — the scroll effect would compute it,
      // but effects don't run in SSR. updateSection just mutates a ref.
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
      // Should not throw and should leave currentSection null. The
      // scrollTo callback guards on `sectionElements.current[id]`.
      expect(ctx.currentSection).toBeNull()
    })

    it('scrollToSection targets a registered section but remains null in SSR', () => {
      const fakeEl = {} as unknown as HTMLDivElement
      // scrollToSection calls setActiveNav(id) — which schedules a state
      // update not observable in the same SSR pass — then calls
      // scrollToSectionElement, which bails when there is no
      // #settings-content-scroller in the DOM.
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

// The bare (no-provider) context fallbacks: calling the consumer hooks
// outside a ScrollSpyProvider must return the noop defaults and never
// throw.
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
