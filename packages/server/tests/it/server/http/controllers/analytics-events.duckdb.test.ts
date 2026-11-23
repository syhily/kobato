import type { AnalyticsHandle } from '@kobato/db/duckdb/connection'

import {
  __adoptAnalyticsHandleForTests,
  __resetAnalyticsEngineForTests,
} from '@kobato/server/bootstrap/analytics-lifecycle'
import { __getRealtimeConnectionCountForTests } from '@kobato/server/domains/analytics/services/realtime-connections'
import { analyticsRouter } from '@kobato/server/http/controllers/admin/analytics.controller'
import { __clearLogCaptureForTests, __logCaptureForTests } from '@kobato/server/infra/logger'
import {
  clearAccessEvents,
  closeTestAnalyticsDb,
  createTestAnalyticsDb,
  seedAccessEvents,
} from '@kobato/server/tests/utils/analytics-db'
import { makeAuthedCtx } from '@kobato/server/tests/utils/mock-ctx'
import { call } from '@orpc/server'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

let analyticsHandle: AnalyticsHandle

beforeAll(async () => {
  analyticsHandle = await createTestAnalyticsDb()
  __adoptAnalyticsHandleForTests(analyticsHandle)
})

beforeEach(async () => {
  await clearAccessEvents(analyticsHandle)
  __clearLogCaptureForTests()
})

afterAll(async () => {
  __resetAnalyticsEngineForTests()
  await closeTestAnalyticsDb(analyticsHandle)
})

async function openStream(sessionId: string, clientAddress = '127.0.0.1', since?: string) {
  return call(analyticsRouter.events, { since }, { context: makeAuthedCtx({ sessionId, clientAddress }) })
}

async function closeStream(iterator: AsyncIterator<unknown>): Promise<void> {
  const before = __getRealtimeConnectionCountForTests()
  await iterator.return?.()
  if (before === 0) {
    return
  }
  expect(await waitUntil(() => __getRealtimeConnectionCountForTests() < before, 2_000)).toBe(true)
}

async function waitUntil(condition: () => boolean, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (!condition()) {
    if (Date.now() >= deadline) {
      return false
    }
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
  return true
}

describe('admin.analytics.events connection cap', () => {
  it('allows two concurrent connections for the same session', async () => {
    const first = await openStream('session-a')
    const second = await openStream('session-a')
    await closeStream(first)
    await closeStream(second)
  })

  it('rejects a third connection with 429', async () => {
    const first = await openStream('session-b')
    const second = await openStream('session-b')
    await expect(openStream('session-b')).rejects.toMatchObject({ status: 429 })
    await closeStream(first)
    await closeStream(second)
  })

  it('does not count different sessions against each other', async () => {
    const connections: AsyncIterator<unknown>[] = []
    for (let i = 0; i < 4; i += 1) {
      connections.push(await openStream(`session-${i}`, `10.0.0.${i}`))
    }
    for (const connection of connections) {
      await closeStream(connection)
    }
  })

  it('decrements the counter when the client disconnects', async () => {
    const first = await openStream('session-c')
    await closeStream(first)
    const again = await openStream('session-c')
    await closeStream(again)
  })
})

describe('admin.analytics.events realtime tail', () => {
  it('ignores an invalid since parameter', async () => {
    const iterator = await openStream('session-since', '127.0.0.1', 'not-a-date')
    await closeStream(iterator)
  })

  it('polls the real tail and yields seeded events', async () => {
    await seedAccessEvents(analyticsHandle, [
      { ts: new Date(), visitorHash: 'rt', path: '/poll-seeded', browser: 'Chrome' },
    ])
    const iterator = await openStream('session-poll')
    const next = await iterator.next()
    expect(next.done).toBe(false)
    expect(JSON.stringify(next.value)).toContain('/poll-seeded')
    expect(JSON.stringify(next.value)).toContain('Chrome')
    await closeStream(iterator)
  })

  it('logs a warning when the realtime query fails', async () => {
    __resetAnalyticsEngineForTests()
    try {
      const iterator = await openStream('session-warn')
      void iterator.next()
      expect(
        await waitUntil(
          () =>
            __logCaptureForTests().some((entry) => entry.level === 'warn' && entry.msg === 'queryRealtimeTail failed'),
          10_000,
        ),
      ).toBe(true)
      await closeStream(iterator)
    } finally {
      __adoptAnalyticsHandleForTests(analyticsHandle)
    }
  })
})
