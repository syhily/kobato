import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  __resetExportHealthForTests,
  activateExportHealth,
  deactivateExportHealth,
  lastExportFailure,
  observeExporter,
  recordExportOutcome,
} from '@/server/infra/trace/export-health'

afterEach(() => {
  __resetExportHealthForTests()
})

describe('export health tracking', () => {
  it('reports nothing before activation and after deactivation', () => {
    const token = {}
    recordExportOutcome(token, 'traces', false, new TypeError('boom'))
    expect(lastExportFailure()).toBeNull()

    activateExportHealth(token)
    recordExportOutcome(token, 'traces', false, new TypeError('boom'))
    expect(lastExportFailure()).toMatchObject({ signal: 'traces', error: 'TypeError' })

    deactivateExportHealth(token)
    expect(lastExportFailure()).toBeNull()
  })

  it('drops outcomes recorded under a stale token (HMR replacement guard)', () => {
    const stale = {}
    const fresh = {}
    activateExportHealth(stale)
    activateExportHealth(fresh)

    recordExportOutcome(stale, 'traces', false, new Error('old runtime'))
    expect(lastExportFailure()).toBeNull()

    recordExportOutcome(fresh, 'metrics', false, new Error('current runtime'))
    expect(lastExportFailure()).toMatchObject({ signal: 'metrics', error: 'Error' })

    // A stale token must not clear the fresh slot either.
    deactivateExportHealth(stale)
    expect(lastExportFailure()).not.toBeNull()
  })

  it('self-heals per signal: a successful export clears only that signal', () => {
    const token = {}
    activateExportHealth(token)
    recordExportOutcome(token, 'traces', false, new Error('down'))
    recordExportOutcome(token, 'logs', false, new Error('down'))

    recordExportOutcome(token, 'traces', true)
    expect(lastExportFailure()).toMatchObject({ signal: 'logs' })

    recordExportOutcome(token, 'logs', true)
    expect(lastExportFailure()).toBeNull()
  })

  it('returns the most recent failure across signals and never an error message', () => {
    const token = {}
    activateExportHealth(token)
    recordExportOutcome(token, 'traces', false, new Error('secret https://obs.internal/token=abc'))
    recordExportOutcome(token, 'metrics', false, 'not-an-error')

    const failure = lastExportFailure()
    expect(failure).toMatchObject({ signal: 'metrics', error: 'string' })
    expect(JSON.stringify(failure)).not.toContain('obs.internal')
  })
})

describe('observeExporter', () => {
  function makeExporter(result: { code: number; error?: unknown }) {
    return {
      export: vi.fn((_items: unknown, callback: (r: { code: number; error?: unknown }) => void) => callback(result)),
      shutdown: vi.fn(() => Promise.resolve()),
      forceFlush: vi.fn(() => Promise.resolve()),
    }
  }

  it('records a failed export and forwards the result untouched', () => {
    const token = {}
    activateExportHealth(token)
    const inner = makeExporter({ code: 1, error: new RangeError('upstream 500') })
    const wrapped = observeExporter(inner, token, 'traces')

    const callback = vi.fn()
    wrapped.export([{ span: true }], callback)

    expect(callback).toHaveBeenCalledWith({ code: 1, error: expect.any(RangeError) })
    expect(lastExportFailure()).toMatchObject({ signal: 'traces', error: 'RangeError' })
  })

  it('clears the recorded failure on a successful export', () => {
    const token = {}
    activateExportHealth(token)
    const inner = makeExporter({ code: 1, error: new Error('down') })
    const wrapped = observeExporter(inner, token, 'logs')
    wrapped.export([], () => undefined)
    expect(lastExportFailure()).not.toBeNull()

    inner.export.mockImplementation((_items: unknown, callback: (r: { code: number }) => void) => callback({ code: 0 }))
    wrapped.export([], () => undefined)
    expect(lastExportFailure()).toBeNull()
  })

  it('passes shutdown and forceFlush through to the inner exporter', async () => {
    const token = {}
    activateExportHealth(token)
    const inner = makeExporter({ code: 0 })
    const wrapped = observeExporter(inner, token, 'metrics')

    await wrapped.shutdown()
    await wrapped.forceFlush?.()

    expect(inner.shutdown).toHaveBeenCalledTimes(1)
    expect(inner.forceFlush).toHaveBeenCalledTimes(1)
  })
})
