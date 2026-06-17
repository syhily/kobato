import { describe, expect, it } from 'vitest'

import { renderHook } from '#/_helpers/hook'
import {
  SettingsSearchProvider,
  createSearchComponentId,
  useSettingsSearch,
  useSettingsSearchContext,
  useSettingsSearchFilter,
} from '@/ui/admin/settings/shell/useSettingsSearch'

describe('ui/admin/settings/shell/useSettingsSearch', () => {
  it('builds a stable component id', () => {
    expect(createSearchComponentId('section', 'uuid-1')).toBe('section-uuid-1')
  })

  it('exposes an empty filter and a setter', () => {
    const { filter, setFilter } = renderHook(useSettingsSearchFilter, {
      wrapper: SettingsSearchProvider,
    })
    expect(filter).toBe('')
    expect(setFilter).toBeInstanceOf(Function)
  })

  it('exposes the search API with default values', () => {
    const api = renderHook(useSettingsSearch, {
      wrapper: SettingsSearchProvider,
    })
    expect(api.checkVisible(['anything'])).toBe(true)
    expect(api.noResult).toBe(false)
    expect(api.getVisibleComponents()).toEqual(new Set())
    expect(api.isOnlyVisibleComponent('a')).toBe(false)
    expect(api.setNoResult).toBeInstanceOf(Function)
    expect(api.registerComponent).toBeInstanceOf(Function)
    expect(api.unregisterComponent).toBeInstanceOf(Function)
  })

  it('returns text unchanged when the filter is empty', () => {
    const { highlightKeywords } = renderHook(useSettingsSearch, {
      wrapper: SettingsSearchProvider,
    })
    expect(highlightKeywords('No filter here')).toBe('No filter here')
  })

  it('combines filter and API in the combined context', () => {
    const ctx = renderHook(useSettingsSearchContext, {
      wrapper: SettingsSearchProvider,
    })
    expect(ctx.filter).toBe('')
    expect(ctx.checkVisible(['keywords'])).toBe(true)
    expect(ctx.setFilter).toBeInstanceOf(Function)
    expect(ctx.setNoResult).toBeInstanceOf(Function)
  })
})
