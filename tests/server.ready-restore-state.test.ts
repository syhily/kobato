import { describe, expect, it } from 'vitest'

import { getPhase, getRestoreResult, setPhase, setRestoreResult } from '@/server/infra/lifecycle'

describe('/ready endpoint restore-state behaviour', () => {
  // Inline the /ready logic so we can test it without importing server.ts
  function readyResponse() {
    const currentPhase = getPhase()
    if (currentPhase !== 'running') {
      return { status: currentPhase, restore: getRestoreResult(), code: 503 }
    }
    return { status: 'ok', code: 200 }
  }

  it('returns ok when phase is running and restore is idle', () => {
    setRestoreResult('idle')
    setPhase('running')
    const res = readyResponse()
    expect(res.status).toBe('ok')
    expect(res.code).toBe(200)
  })

  it('returns restoring 503 when restore is in progress', () => {
    setRestoreResult('draining')
    setPhase('restarting')
    const res = readyResponse()
    expect(res.status).toBe('restarting')
    expect(res.code).toBe(503)
    expect(res.restore!.phase).toBe('draining')
  })

  it('returns restoring 503 with failed details on restore failure', () => {
    setRestoreResult('failed', 'psql exited with code 1')
    setPhase('restarting')
    const res = readyResponse()
    expect(res.status).toBe('restarting')
    expect(res.code).toBe(503)
    expect(res.restore!.phase).toBe('failed')
    expect(res.restore!.error).toBe('psql exited with code 1')
  })

  it('returns restarting 503 when only restart state is active', () => {
    setRestoreResult('idle')
    setPhase('restarting')
    const res = readyResponse()
    expect(res.status).toBe('restarting')
    expect(res.code).toBe(503)
  })
})
