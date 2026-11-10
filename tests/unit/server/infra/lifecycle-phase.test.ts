import { afterEach, describe, expect, it } from 'vitest'

import { __getLifecycleContainer, getServerPhase, setServerPhase, type ServerPhase } from '@/server/infra/lifecycle'

// The lifecycle module holds module-level state and registers SIGTERM/SIGINT
// listeners on import. The container is a singleton shared across tests, so
// each test must reset the phase explicitly to a known starting point.

function resetTo(phase: ServerPhase): void {
  const c = __getLifecycleContainer()
  c.serverPhase = phase
}

afterEach(() => {
  resetTo('booting')
})

describe('server/infra/lifecycle — setServerPhase transition table', () => {
  it('reports the booting phase on first read', () => {
    resetTo('booting')
    expect(getServerPhase()).toBe('booting')
  })

  it('is a no-op when the new phase equals the current phase', () => {
    resetTo('running')
    setServerPhase('running')
    expect(getServerPhase()).toBe('running')
  })

  it('allows all valid transitions out of booting', () => {
    const allowed: ServerPhase[] = ['running', 'restarting', 'failed', 'shutting-down']
    for (const target of allowed) {
      resetTo('booting')
      setServerPhase(target)
      expect(getServerPhase()).toBe(target)
    }
  })

  it('rejects an invalid booting→booting self-transition silently (no-op)', () => {
    resetTo('booting')
    setServerPhase('booting')
    expect(getServerPhase()).toBe('booting')
  })

  it('allows only restarting and shutting-down transitions out of running', () => {
    const allowed: ServerPhase[] = ['restarting', 'shutting-down']
    for (const target of allowed) {
      resetTo('running')
      setServerPhase(target)
      expect(getServerPhase()).toBe(target)
    }
    resetTo('running')
    setServerPhase('booting' as ServerPhase)
    expect(getServerPhase()).toBe('running')
    resetTo('running')
    setServerPhase('failed' as ServerPhase)
    expect(getServerPhase()).toBe('running')
  })

  it('allows running, failed, shutting-down transitions out of restarting', () => {
    for (const target of ['running', 'failed', 'shutting-down'] as ServerPhase[]) {
      resetTo('restarting')
      setServerPhase(target)
      expect(getServerPhase()).toBe(target)
    }
    resetTo('restarting')
    setServerPhase('booting' as ServerPhase)
    expect(getServerPhase()).toBe('restarting')
  })

  it('allows only restarting and shutting-down transitions out of failed', () => {
    for (const target of ['restarting', 'shutting-down'] as ServerPhase[]) {
      resetTo('failed')
      setServerPhase(target)
      expect(getServerPhase()).toBe(target)
    }
    // Recovering from failed must go through restarting.
    resetTo('failed')
    setServerPhase('running' as ServerPhase)
    expect(getServerPhase()).toBe('failed')
    resetTo('failed')
    setServerPhase('booting' as ServerPhase)
    expect(getServerPhase()).toBe('failed')
  })

  it('allows no transitions out of shutting-down (terminal)', () => {
    for (const target of ['booting', 'running', 'restarting', 'failed'] as ServerPhase[]) {
      resetTo('shutting-down')
      setServerPhase(target)
      expect(getServerPhase()).toBe('shutting-down')
    }
    resetTo('shutting-down')
    setServerPhase('shutting-down')
    expect(getServerPhase()).toBe('shutting-down')
  })
})
