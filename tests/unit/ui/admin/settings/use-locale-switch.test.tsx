// @vitest-environment happy-dom

import { act } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { SettingsChangeVerdict } from '@/ui/admin/settings/shell/settings-change-verdict'

import { renderHookWithI18n } from '#/_helpers/i18n-render'
import { SETTINGS_SKIP_COMMIT } from '@/ui/admin/settings/shell/settings-change-verdict'
import { useLocaleSwitch } from '@/ui/admin/settings/use-locale-switch'

type Locale = 'zh-CN' | 'en-US' | 'zh-TW'

interface SwitchOptions {
  loadedLocale: Locale
  runTransaction: <T>(task: () => T | Promise<T>, focusAnchor?: HTMLElement | null) => Promise<T>
  focusAnchor?: () => HTMLElement | null
  flushAll: () => Promise<boolean>
  change: (locale: Locale) => void
  commit: () => Promise<boolean>
  broadcast: (locale: Locale) => void
  reload: () => void
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

function renderSwitch(overrides: Partial<SwitchOptions> = {}) {
  const calls: string[] = []
  const transactionAnchors: Array<HTMLElement | null | undefined> = []
  const runTransaction: SwitchOptions['runTransaction'] = async (task, focusAnchor) => {
    calls.push('transaction')
    transactionAnchors.push(focusAnchor)
    return task()
  }
  const flushAll = vi.fn(async () => {
    calls.push('flush')
    return true
  })
  const change = vi.fn((_locale: Locale) => {
    calls.push('change')
  })
  const commit = vi.fn(async () => {
    calls.push('commit')
    return true
  })
  const broadcast = vi.fn((_locale: Locale) => {
    calls.push('broadcast')
  })
  const reload = vi.fn(() => {
    calls.push('reload')
  })
  const options: SwitchOptions = {
    loadedLocale: 'zh-CN',
    runTransaction,
    flushAll,
    change,
    commit,
    broadcast,
    reload,
    ...overrides,
  }
  const { result } = renderHookWithI18n(() => useLocaleSwitch(options))
  return { result, calls, transactionAnchors, runTransaction, flushAll, change, commit, broadcast, reload }
}

describe('ui/admin/settings/use-locale-switch', () => {
  it('runs flush → field change → explicit commit → one reload, then releases pending', async () => {
    const { result, calls, transactionAnchors, broadcast } = renderSwitch()
    expect(result.current.isSwitching).toBe(false)

    let verdict: SettingsChangeVerdict | undefined
    await act(async () => {
      verdict = await result.current.requestChange('en-US')
    })

    expect(verdict).toEqual(SETTINGS_SKIP_COMMIT)
    // The transaction wrapper covers flush → change → explicit commit →
    // announce → reload. Peers learn about the change after the server has it.
    expect(calls).toEqual(['transaction', 'flush', 'change', 'commit', 'broadcast', 'reload'])
    expect(broadcast).toHaveBeenCalledWith('en-US')
    // No explicit anchor → the provider keeps its active-element fallback.
    expect(transactionAnchors).toEqual([undefined])
    expect(result.current.isSwitching).toBe(false)
  })

  it('passes the explicit focus anchor to the transaction (portal options unmount)', async () => {
    const anchor = document.createElement('button')
    const focusAnchor = vi.fn(() => anchor)
    const { result, transactionAnchors } = renderSwitch({ focusAnchor })

    await act(async () => {
      await result.current.requestChange('en-US')
    })

    expect(focusAnchor).toHaveBeenCalledOnce()
    expect(transactionAnchors).toEqual([anchor])
  })

  it('vetoes the switch when any dirty card fails: no field change, no commit, no reload', async () => {
    const change = vi.fn()
    const commit = vi.fn(async () => true)
    const broadcast = vi.fn()
    const reload = vi.fn()
    const { result, calls } = renderSwitch({
      flushAll: vi.fn(async () => false),
      change,
      commit,
      broadcast,
      reload,
    })

    await act(async () => {
      await result.current.requestChange('en-US')
    })

    // The whole attempt still ran inside the transaction (which releases the
    // workspace on failure via its `finally`).
    expect(calls[0]).toBe('transaction')
    expect(change).not.toHaveBeenCalled()
    expect(commit).not.toHaveBeenCalled()
    expect(broadcast).not.toHaveBeenCalled()
    expect(reload).not.toHaveBeenCalled()
    expect(result.current.isSwitching).toBe(false)
  })

  it('does not reload — nor announce — when the explicit locale commit is rejected', async () => {
    const { result, calls, commit, broadcast, reload } = renderSwitch()
    commit.mockImplementationOnce(async () => {
      calls.push('commit')
      return false
    })

    await act(async () => {
      await result.current.requestChange('en-US')
    })

    expect(calls).toEqual(['transaction', 'flush', 'change', 'commit'])
    expect(broadcast).not.toHaveBeenCalled()
    expect(reload).not.toHaveBeenCalled()
    expect(result.current.isSwitching).toBe(false)
  })

  it('ignores a second pick while the transaction is in flight (one flush, one commit)', async () => {
    const gate = deferred<boolean>()
    const flushAll = vi.fn(() => gate.promise)
    const commit = vi.fn(async () => true)
    const reload = vi.fn()
    const { result } = renderSwitch({ flushAll, commit, reload })

    let first!: Promise<SettingsChangeVerdict>
    act(() => {
      first = result.current.requestChange('en-US')
    })
    expect(result.current.isSwitching).toBe(true)

    let second!: SettingsChangeVerdict
    await act(async () => {
      second = await result.current.requestChange('zh-TW')
    })
    expect(second).toEqual(SETTINGS_SKIP_COMMIT)
    expect(flushAll).toHaveBeenCalledOnce()
    expect(commit).not.toHaveBeenCalled()

    await act(async () => {
      gate.resolve(true)
      await first
    })
    expect(flushAll).toHaveBeenCalledOnce()
    expect(commit).toHaveBeenCalledOnce()
    expect(reload).toHaveBeenCalledOnce()
    expect(result.current.isSwitching).toBe(false)
  })

  it('is a no-op for a null pick or the already-loaded locale', async () => {
    const { result, flushAll } = renderSwitch()

    await act(async () => {
      await result.current.requestChange(null)
      await result.current.requestChange('zh-CN')
    })

    expect(flushAll).not.toHaveBeenCalled()
  })

  it('releases the pending flag when the flush throws (the wrapper owns the rejection)', async () => {
    const { result } = renderSwitch({
      flushAll: vi.fn(async () => {
        throw new Error('flush exploded')
      }),
    })

    await act(async () => {
      await expect(result.current.requestChange('en-US')).rejects.toThrow('flush exploded')
    })
    expect(result.current.isSwitching).toBe(false)
  })
})
