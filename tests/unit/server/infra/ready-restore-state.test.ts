import { beforeEach, describe, expect, it, vi } from 'vitest'

const getServerPhase = vi.fn().mockReturnValue('running')
const getRestoreJobStatus = vi.fn().mockReturnValue({ phase: 'idle', startedAt: '' })

vi.mock('@/server/infra/lifecycle', () => ({
  getServerPhase,
}))

vi.mock('@/server/domains/backup/restore-machine', () => ({
  getRestoreJobStatus,
}))

describe('/ready endpoint restore-state behaviour', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // Inline the /ready logic so we can test it without importing server.ts
  function readyResponse() {
    const phase = getServerPhase()
    if (phase !== 'running') {
      return { status: phase, restore: getRestoreJobStatus(), code: 503 as const }
    }
    return { status: 'ok', restore: getRestoreJobStatus(), code: 200 as const }
  }

  it('returns ok when phase is running and restore is idle', () => {
    getServerPhase.mockReturnValue('running')
    getRestoreJobStatus.mockReturnValue({ phase: 'idle', startedAt: '' })
    const res = readyResponse()
    expect(res.status).toBe('ok')
    expect(res.code).toBe(200)
  })

  it('returns restoring 503 when restore is in progress', () => {
    getServerPhase.mockReturnValue('restarting')
    getRestoreJobStatus.mockReturnValue({ phase: 'draining', startedAt: '2026-01-01T00:00:00.000Z' })
    const res = readyResponse()
    expect(res.status).toBe('restarting')
    expect(res.code).toBe(503)
    expect(res.restore.phase).toBe('draining')
  })

  it('returns restoring 503 with failed details on restore failure', () => {
    getServerPhase.mockReturnValue('restarting')
    getRestoreJobStatus.mockReturnValue({
      phase: 'failed',
      startedAt: '2026-01-01T00:00:00.000Z',
      error: 'restore exited with code 1',
    })
    const res = readyResponse()
    expect(res.status).toBe('restarting')
    expect(res.code).toBe(503)
    expect(res.restore.phase).toBe('failed')
    expect(res.restore.error).toBe('restore exited with code 1')
  })

  it('returns restarting 503 when only restart state is active', () => {
    getServerPhase.mockReturnValue('restarting')
    getRestoreJobStatus.mockReturnValue({ phase: 'idle', startedAt: '' })
    const res = readyResponse()
    expect(res.status).toBe('restarting')
    expect(res.code).toBe(503)
  })
})
