import { describe, expect, it } from 'vitest'

import { getRestoreState, getServerPhase, setRestoreState, setServerPhase } from '@/server/infra/lifecycle'

describe('/ready endpoint restore-state behaviour', () => {
  // Inline the /ready logic so we can test it without importing server.ts
  function readyResponse() {
    const phase = getServerPhase()
    if (phase !== 'running') {
      return { status: phase, restore: getRestoreState(), code: 503 as const }
    }
    return { status: 'ok', restore: getRestoreState(), code: 200 as const }
  }

  it('returns ok when phase is running and restore is idle', () => {
    setRestoreState('idle')
    setServerPhase('running')
    const res = readyResponse()
    expect(res.status).toBe('ok')
    expect(res.code).toBe(200)
  })

  it('returns restoring 503 when restore is in progress', () => {
    setRestoreState('draining')
    setServerPhase('restarting')
    const res = readyResponse()
    expect(res.status).toBe('restarting')
    expect(res.code).toBe(503)
    expect(res.restore.phase).toBe('draining')
  })

  it('returns restoring 503 with failed details on restore failure', () => {
    setRestoreState('failed', 'psql exited with code 1')
    setServerPhase('restarting')
    const res = readyResponse()
    expect(res.status).toBe('restarting')
    expect(res.code).toBe(503)
    expect(res.restore.phase).toBe('failed')
    expect(res.restore.error).toBe('psql exited with code 1')
  })

  it('returns restarting 503 when only restart state is active', () => {
    setRestoreState('idle')
    setServerPhase('restarting')
    const res = readyResponse()
    expect(res.status).toBe('restarting')
    expect(res.code).toBe(503)
  })

  it('returns booting 503 when server is initializing', () => {
    setRestoreState('idle')
    setServerPhase('booting')
    const res = readyResponse()
    expect(res.status).toBe('booting')
    expect(res.code).toBe(503)
  })
})
