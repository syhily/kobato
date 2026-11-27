import { afterEach, describe, expect, it, vi } from 'vitest'

async function load() {
  return import('@kobato/server/infra/dev-host-state')
}

describe('infra/dev-host-state', () => {
  afterEach(async () => {
    const state = await load()
    state.__resetDevHostStateForTests()
    vi.resetModules()
  })

  it('is absent when no dev host adopted the server: flags drop, values drop, disposers never run', async () => {
    const state = await load()

    expect(state.devHostState()).toBeUndefined()
    state.writeDevHostFlag('ran', true)
    expect(state.readDevHostFlag('ran')).toBe(false)
    state.writeDevHostValue('handle', { id: 'db' })
    expect(state.readDevHostValue('handle')).toBeUndefined()

    const first = vi.fn()
    state.onDevHostDispose('module', first)
    vi.resetModules()
    const next = await load()
    next.onDevHostDispose('module', vi.fn())

    expect(first).not.toHaveBeenCalled()
    expect(next.devHostState()).toBeUndefined()
  })

  it('carries what an earlier evaluation wrote to a later one', async () => {
    const state = await load()
    const installed = state.__installDevHostStateForTests()

    expect(state.devHostState()).toBe(installed)
    state.writeDevHostFlag('migrationsRan', true)
    const handle = { id: 'content-db' }
    state.writeDevHostValue('handle', handle)

    vi.resetModules()
    const next = await load()

    expect(next.devHostState()).toBe(installed)
    expect(next.readDevHostFlag('migrationsRan')).toBe(true)
    expect(next.readDevHostValue('handle')).toBe(handle)
    expect(next.readDevHostValue('missing')).toBeUndefined()

    next.writeDevHostFlag('migrationsRan', false)
    next.deleteDevHostValue('handle')
    expect(state.readDevHostFlag('migrationsRan')).toBe(false)
    expect(state.readDevHostValue('handle')).toBeUndefined()
  })

  it('runs the previous evaluation’s disposer when a module re-registers under the same key', async () => {
    const state = await load()
    state.__installDevHostStateForTests()

    const first = vi.fn()
    const second = vi.fn()
    state.onDevHostDispose('infra/trace/runtime', first)
    expect(first).not.toHaveBeenCalled()

    vi.resetModules()
    const next = await load()
    next.onDevHostDispose('infra/trace/runtime', second)
    expect(first).toHaveBeenCalledTimes(1)
    expect(second).not.toHaveBeenCalled()

    next.onDevHostDispose('infra/trace/runtime', vi.fn())
    expect(second).toHaveBeenCalledTimes(1)

    next.onDevHostDispose('infra/db/query-diagnostics', vi.fn())
    expect(first).toHaveBeenCalledTimes(1)
  })

  it('a fresh install starts empty and forgets every earlier evaluation', async () => {
    const state = await load()
    const previous = state.__installDevHostStateForTests()
    state.writeDevHostFlag('migrationsRan', true)
    const disposed = vi.fn()
    state.onDevHostDispose('infra/lifecycle', disposed)

    vi.resetModules()
    const next = await load()
    const fresh = next.__installDevHostStateForTests()

    expect(fresh).not.toBe(previous)
    expect(next.readDevHostFlag('migrationsRan')).toBe(false)
    next.onDevHostDispose('infra/lifecycle', vi.fn())
    expect(disposed).not.toHaveBeenCalled()
  })
})
