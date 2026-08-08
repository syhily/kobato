import * as React from 'react'
import { describe, expect, it } from 'vitest'

import { renderHook } from '#/_helpers/hook'
import {
  SettingsSearchProvider,
  createSearchComponentId,
  useSettingsSearch,
  useSettingsSearchContext,
  useSettingsSearchFilter,
} from '@/ui/admin/settings/shell/useSettingsSearch'

// Extra coverage for useSettingsSearch under the single-pass SSR harness
// (no effects fire): observable surfaces are initial state, callable
// callbacks, and the empty-filter branches.

describe('ui/admin/settings/shell/useSettingsSearch — extra (initial-state surfaces)', () => {
  it('createSearchComponentId joins base and unique with a dash', () => {
    expect(createSearchComponentId('general', 'abc')).toBe('general-abc')
    expect(createSearchComponentId('', '')).toBe('-')
  })

  it('exposes an empty filter and a function setter through the filter context', () => {
    const { filter, setFilter } = renderHook(useSettingsSearchFilter, {
      wrapper: SettingsSearchProvider,
    })
    expect(filter).toBe('')
    expect(setFilter).toBeInstanceOf(Function)
  })

  it('checkVisible returns true for any keywords while the filter is empty', () => {
    const { checkVisible } = renderHook(useSettingsSearch, { wrapper: SettingsSearchProvider })
    // Empty keywords array -> early-return true.
    expect(checkVisible([])).toBe(true)
    // Non-empty keywords + empty filter -> still true (the `!filter` branch).
    expect(checkVisible(['anything', 'general', 'GEN'])).toBe(true)
  })

  it('highlightKeywords returns string text unchanged while the filter is empty', () => {
    const { highlightKeywords } = renderHook(useSettingsSearch, { wrapper: SettingsSearchProvider })
    expect(highlightKeywords('No filter here')).toBe('No filter here')
  })

  it('highlightKeywords returns a non-string, non-array ReactNode untouched', () => {
    const { highlightKeywords } = renderHook(useSettingsSearch, { wrapper: SettingsSearchProvider })
    const element = React.createElement('div', null, 'x')
    // Neither the string nor the array branch matches, so the node passes through.
    expect(highlightKeywords(element)).toBe(element)
  })

  it('highlightKeywords returns null/undefined/boolean primitives untouched', () => {
    const { highlightKeywords } = renderHook(useSettingsSearch, { wrapper: SettingsSearchProvider })
    expect(highlightKeywords(null)).toBeNull()
    expect(highlightKeywords(undefined)).toBeUndefined()
    expect(highlightKeywords(false)).toBe(false)
    expect(highlightKeywords(true)).toBe(true)
  })

  it('highlightKeywords returns numeric primitives untouched', () => {
    const { highlightKeywords } = renderHook(useSettingsSearch, { wrapper: SettingsSearchProvider })
    // A number is not a string nor an array, so it passes through.
    expect(highlightKeywords(42)).toBe(42)
  })

  it('registerComponent / unregisterComponent are callable without throwing', () => {
    const { registerComponent, unregisterComponent } = renderHook(useSettingsSearch, {
      wrapper: SettingsSearchProvider,
    })
    expect(() => {
      registerComponent('general-1', ['general', 'site'])
      registerComponent('mail-1', ['mail'])
      // Overwrite an existing registration.
      registerComponent('general-1', ['overwritten'])
      // Unregister an id that was never registered (idempotent no-op).
      unregisterComponent('never-registered')
      // Unregister a registered id.
      unregisterComponent('general-1')
    }).not.toThrow()
  })

  it('getVisibleComponents returns an empty set before any filter is applied', () => {
    const { getVisibleComponents } = renderHook(useSettingsSearch, { wrapper: SettingsSearchProvider })
    expect(getVisibleComponents()).toBeInstanceOf(Set)
    expect(getVisibleComponents().size).toBe(0)
  })

  it('isOnlyVisibleComponent is false for any id against the empty visible set', () => {
    const { isOnlyVisibleComponent } = renderHook(useSettingsSearch, { wrapper: SettingsSearchProvider })
    expect(isOnlyVisibleComponent('anything')).toBe(false)
    expect(isOnlyVisibleComponent('')).toBe(false)
  })

  it('noResult defaults to false and setNoResult is callable', () => {
    const { noResult, setNoResult } = renderHook(useSettingsSearch, { wrapper: SettingsSearchProvider })
    expect(noResult).toBe(false)
    expect(setNoResult).toBeInstanceOf(Function)
    expect(() => setNoResult(true)).not.toThrow()
  })

  it('the combined context merges filter state and the search API', () => {
    const ctx = renderHook(useSettingsSearchContext, { wrapper: SettingsSearchProvider })
    expect(ctx.filter).toBe('')
    expect(ctx.setFilter).toBeInstanceOf(Function)
    expect(ctx.checkVisible).toBeInstanceOf(Function)
    expect(ctx.highlightKeywords).toBeInstanceOf(Function)
    expect(ctx.noResult).toBe(false)
    expect(ctx.setNoResult).toBeInstanceOf(Function)
    expect(ctx.registerComponent).toBeInstanceOf(Function)
    expect(ctx.unregisterComponent).toBeInstanceOf(Function)
    expect(ctx.getVisibleComponents).toBeInstanceOf(Function)
    expect(ctx.isOnlyVisibleComponent).toBeInstanceOf(Function)
  })
})

// No-provider fallbacks: hooks return the noop defaults and never throw.
describe('ui/admin/settings/shell/useSettingsSearch — default (no provider) context', () => {
  it('useSettingsSearchFilter returns the default empty filter + noop setter', () => {
    const { filter, setFilter } = renderHook(useSettingsSearchFilter)
    expect(filter).toBe('')
    expect(() => setFilter('ignored')).not.toThrow()
  })

  it('useSettingsSearch returns the documented default API', () => {
    const api = renderHook(useSettingsSearch)
    expect(api.checkVisible(['anything'])).toBe(true)
    expect(api.checkVisible([])).toBe(true)
    expect(api.highlightKeywords('passthrough')).toBe('passthrough')
    const el = React.createElement('span')
    expect(api.highlightKeywords(el)).toBe(el)
    expect(api.noResult).toBe(false)
    // getVisibleComponents returns an empty Set.
    expect(api.getVisibleComponents()).toBeInstanceOf(Set)
    expect(api.getVisibleComponents().size).toBe(0)
    expect(api.isOnlyVisibleComponent('a')).toBe(false)
    expect(() => {
      api.setNoResult(true)
      api.registerComponent('id', ['kw'])
      api.unregisterComponent('id')
    }).not.toThrow()
  })
})
