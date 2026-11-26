import {
  boundedUpstreamSignal,
  DEFAULT_REQUEST_TIMEOUT_MS,
  requestTimeoutMsForProcedure,
  requestTimeoutMsForUrl,
} from '@kobato/api/client/request-timeout'
import { describe, expect, it } from 'vitest'

const RESTORE_PATHS = [
  '/rpc/admin/backup/uploadRestoreDecrypt',
  '/rpc/admin/backup/uploadRestore',
  '/rpc/account/setup/restore',
]

async function flush(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

describe('api/client/request-timeout — declared override table', () => {
  it('defaults every procedure to the fallback timeout', () => {
    expect(requestTimeoutMsForProcedure(['public', 'content', 'bootstrap'], 30_000)).toBe(30_000)
    expect(requestTimeoutMsForUrl('/rpc/public/content/bootstrap', DEFAULT_REQUEST_TIMEOUT_MS)).toBe(
      DEFAULT_REQUEST_TIMEOUT_MS,
    )
    expect(requestTimeoutMsForUrl('/rpc/admin/backup/restore', 45_000)).toBe(45_000)
    expect(requestTimeoutMsForUrl('/feed', DEFAULT_REQUEST_TIMEOUT_MS)).toBe(DEFAULT_REQUEST_TIMEOUT_MS)
    expect(requestTimeoutMsForUrl('/rpc', DEFAULT_REQUEST_TIMEOUT_MS)).toBe(DEFAULT_REQUEST_TIMEOUT_MS)
  })

  it('raises the timeout to the declared requestTimeoutMs metadata when it is larger', () => {
    for (const path of RESTORE_PATHS) {
      expect(requestTimeoutMsForUrl(path, DEFAULT_REQUEST_TIMEOUT_MS)).toBe(30 * 60_000)
    }
    expect(requestTimeoutMsForProcedure(['admin', 'backup', 'uploadRestore'], DEFAULT_REQUEST_TIMEOUT_MS)).toBe(
      30 * 60_000,
    )
    expect(requestTimeoutMsForProcedure(['account', 'setup', 'restore'], 60_000)).toBe(30 * 60_000)
  })

  it('matches declared prefixes exactly and by child path, never by lookalike prefix', () => {
    expect(requestTimeoutMsForUrl('/rpc/admin/backup/uploadRestoreDecrypt/extra', 1_000)).toBe(30 * 60_000)
    expect(requestTimeoutMsForUrl('/rpc/admin/backup/uploadRestoreDecryptX', 1_000)).toBe(1_000)
    expect(requestTimeoutMsForUrl('/rpc/admin/backup/upload', 1_000)).toBe(1_000)
  })
})

describe('api/client/request-timeout — boundedUpstreamSignal', () => {
  it('aborts the composed signal when the timeout fires first', async () => {
    const outer = new AbortController()
    const bounded = boundedUpstreamSignal(outer.signal, 10)
    expect(bounded.signal.aborted).toBe(false)
    await flush(50)
    expect(bounded.timedOut).toBe(true)
    expect(bounded.signal.aborted).toBe(true)
    expect((bounded.signal.reason as Error).name).toBe('TimeoutError')
  })

  it('aborts the composed signal when the outer signal aborts, without flagging a timeout', async () => {
    const outer = new AbortController()
    const bounded = boundedUpstreamSignal(outer.signal, 60_000)
    outer.abort()
    expect(bounded.signal.aborted).toBe(true)
    expect(bounded.timedOut).toBe(false)
  })

  it('starts aborted when the outer signal is already aborted', () => {
    const outer = new AbortController()
    outer.abort()
    const bounded = boundedUpstreamSignal(outer.signal, 60_000)
    expect(bounded.signal.aborted).toBe(true)
    expect(bounded.timedOut).toBe(false)
  })

  it('release stops the timeout from ever aborting the composed signal', async () => {
    const outer = new AbortController()
    const bounded = boundedUpstreamSignal(outer.signal, 10)
    bounded.release()
    await flush(50)
    expect(bounded.signal.aborted).toBe(false)
    expect(bounded.timedOut).toBe(false)
    outer.abort()
    expect(bounded.signal.aborted).toBe(true)
  })
})
