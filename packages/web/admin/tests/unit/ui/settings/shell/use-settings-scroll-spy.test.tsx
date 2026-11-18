import { renderHook } from '@kobato/test/hook.tsx'
import {
  ScrollSpyProvider,
  useScrollSpy,
  useScrollSpyContext,
  useScrollSpyNav,
} from '@kobato/web-admin/ui/settings/shell/use-settings-scroll-spy.tsx'
import { describe, expect, it } from 'vitest'

describe('ui/admin/settings/shell/useSettingsScrollSpy', () => {
  it('exposes the scroll-spy context API', () => {
    const ctx = renderHook(useScrollSpyContext, { wrapper: ScrollSpyProvider })
    expect(ctx.currentSection).toBeNull()
    expect(ctx.updateSection).toBeInstanceOf(Function)
    expect(ctx.updateNav).toBeInstanceOf(Function)
    expect(ctx.scrollToSection).toBeInstanceOf(Function)
  })

  it('returns a section ref', () => {
    const { ref } = renderHook(() => useScrollSpy('general'), { wrapper: ScrollSpyProvider })
    expect(ref.current).toBeNull()
  })

  it('returns a nav ref and marker prop', () => {
    const { ref, props } = renderHook(() => useScrollSpyNav('general'), { wrapper: ScrollSpyProvider })
    expect(ref.current).toBeNull()
    expect(props).toEqual({ 'data-setting-nav-item': true })
  })
})
