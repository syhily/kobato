import { describe, expect, it } from 'vitest'

import { getRestoreState, setRestoreState } from '@/server/infra/restore-state'
import { getRestartState, setRestartState } from '@/server/infra/shutdown'

describe('/ready endpoint restore-state behaviour', () => {
  // Inline the /ready logic so we can test it without importing server.ts
  function readyResponse() {
    const restore = getRestoreState()
    if (restore.phase !== 'idle') {
      return { status: 'restoring', restore, code: 503 }
    }
    if (getRestartState() === 'restarting') {
      return { status: 'restarting', code: 503 }
    }
    return { status: 'ok', code: 200 }
  }

  it('returns ok when both states are idle', () => {
    setRestoreState('idle')
    setRestartState('idle')
    const res = readyResponse()
    expect(res.status).toBe('ok')
    expect(res.code).toBe(200)
  })

  it('returns restoring 503 when restore is in progress', () => {
    setRestoreState('draining')
    setRestartState('restarting')
    const res = readyResponse()
    expect(res.status).toBe('restoring')
    expect(res.code).toBe(503)
    expect(res.restore!.phase).toBe('draining')
  })

  it('returns restoring 503 with failed details on restore failure', () => {
    setRestoreState('failed', 'psql exited with code 1')
    setRestartState('restarting')
    const res = readyResponse()
    expect(res.status).toBe('restoring')
    expect(res.code).toBe(503)
    expect(res.restore!.phase).toBe('failed')
    expect(res.restore!.error).toBe('psql exited with code 1')
  })

  it('returns restarting 503 when only restart state is active', () => {
    setRestoreState('idle')
    setRestartState('restarting')
    const res = readyResponse()
    expect(res.status).toBe('restarting')
    expect(res.code).toBe(503)
  })
})
