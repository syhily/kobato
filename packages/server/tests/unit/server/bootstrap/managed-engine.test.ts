import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@kobato/server/infra/lifecycle', () => ({
  registerShutdownHook: vi.fn(),
  unregisterShutdownHook: vi.fn(),
}))

interface Handle {
  id: string
}

function adapter(opened: Handle[]) {
  const close = vi.fn(async () => undefined)
  return {
    open: vi.fn(async () => {
      const handle = { id: `handle-${opened.length + 1}` }
      opened.push(handle)
      return handle
    }),
    close,
  }
}

async function load() {
  const engine = await import('@kobato/server/bootstrap/managed-engine')
  const state = await import('@kobato/server/infra/dev-host-state')
  return { ManagedEngine: engine.ManagedEngine, state }
}

describe('bootstrap/managed-engine', () => {
  beforeEach(async () => {
    const { state } = await load()
    state.__resetDevHostStateForTests()
  })

  afterEach(async () => {
    const { state } = await load()
    state.__resetDevHostStateForTests()
    vi.resetModules()
  })

  it('opens once per instance and closes through the adapter when no dev host adopted the server', async () => {
    const { ManagedEngine, state } = await load()
    const opened: Handle[] = []
    const engineAdapter = adapter(opened)
    const engine = new ManagedEngine<Handle>(engineAdapter, 'db-handle')

    expect(engine.peek()).toBeNull()
    expect(() => engine.get()).toThrow('Engine not initialized')

    const handle = await engine.init()
    expect(await engine.init()).toBe(handle)
    expect(engineAdapter.open).toHaveBeenCalledTimes(1)
    expect(engine.get()).toBe(handle)
    expect(state.readDevHostValue('db-handle')).toBeUndefined()

    await engine.closeForSwap()
    expect(engineAdapter.close).toHaveBeenCalledWith(handle)
    expect(engine.peek()).toBeNull()
  })

  it('hands a stored handle to the next evaluation instead of opening again, and unregisters the previous shutdown hook', async () => {
    const first = await load()
    first.state.__installDevHostStateForTests()
    const opened: Handle[] = []
    const engineAdapter = adapter(opened)
    const firstEngine = new first.ManagedEngine<Handle>(engineAdapter, 'db-handle')
    const handle = await firstEngine.init()
    const firstHooks = await import('@kobato/server/infra/lifecycle')
    const register = vi.mocked(firstHooks.registerShutdownHook)
    const unregister = vi.mocked(firstHooks.unregisterShutdownHook)
    expect(register).toHaveBeenCalledTimes(1)
    const previousHook = register.mock.calls[0]![0]

    vi.resetModules()
    const next = await load()
    const nextEngine = new next.ManagedEngine<Handle>(engineAdapter, 'db-handle')

    expect(await nextEngine.init()).toBe(handle)
    expect(engineAdapter.open).toHaveBeenCalledTimes(1)
    expect(opened).toEqual([handle])
    expect(next.state.readDevHostValue('db-handle')).toBe(handle)
    expect(unregister, 'the re-evaluation retired the previous engine’s shutdown hook').toHaveBeenCalledTimes(1)
    expect(unregister.mock.calls[0]![0]).toBe(previousHook)

    await nextEngine.closeForSwap()
    expect(engineAdapter.close).toHaveBeenCalledTimes(1)
    expect(next.state.readDevHostValue('db-handle')).toBeUndefined()

    const reopened = await new next.ManagedEngine<Handle>(engineAdapter, 'db-handle').init()
    expect(reopened).not.toBe(handle)
    expect(engineAdapter.open).toHaveBeenCalledTimes(2)
  })

  it('ignores a stored value that is not an object', async () => {
    const { ManagedEngine, state } = await load()
    state.__installDevHostStateForTests()
    state.writeDevHostValue('db-handle', 'not-a-handle')
    const opened: Handle[] = []
    const engineAdapter = adapter(opened)

    const handle = await new ManagedEngine<Handle>(engineAdapter, 'db-handle').init()

    expect(handle).toEqual({ id: 'handle-1' })
    expect(state.readDevHostValue('db-handle')).toBe(handle)
  })
})
