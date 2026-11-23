import type { AnalyticsHandle } from '@kobato/db/duckdb/connection'
import type { Env } from '@kobato/server/http/hono-env'

import { engineOf } from '@kobato/db/duckdb/connection'
import {
  __adoptAnalyticsHandleForTests,
  __resetAnalyticsEngineForTests,
} from '@kobato/server/bootstrap/analytics-lifecycle'
import { getDatabaseHandle } from '@kobato/server/bootstrap/db-lifecycle'
import { flushDeviceEnvBeacons } from '@kobato/server/domains/analytics/services/env-beacon'
import { createApiApp } from '@kobato/server/http/app'
import { publicAnalyticsRouter } from '@kobato/server/http/controllers/public/analytics.controller'
import { initAllBatchers, resetAllBatchers } from '@kobato/server/infra/db/batcher-registry'
import { __resetRateLimitsForTests } from '@kobato/server/infra/rate-limit'
import { closeTestAnalyticsDb, createTestAnalyticsDb } from '@kobato/server/tests/utils/analytics-db'
import { getTestDb } from '@kobato/server/tests/utils/integration-db'
import { makePublicCtx } from '@kobato/server/tests/utils/mock-ctx'
import { makeRequestContext } from '@kobato/server/tests/utils/request-context'
import { call } from '@orpc/server'
import { Hono } from 'hono'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'

const EVENT_ID = '00000000-0000-4000-8000-0000000000c1'
const db = getTestDb()
let analyticsHandle: AnalyticsHandle

beforeEach(async () => {
  await resetAllBatchers()
  if (analyticsHandle?.closed === false) {
    await closeTestAnalyticsDb(analyticsHandle)
  }
  analyticsHandle = await createTestAnalyticsDb()
  __resetAnalyticsEngineForTests()
  __adoptAnalyticsHandleForTests(analyticsHandle)
  initAllBatchers(getDatabaseHandle())
  await engineOf(analyticsHandle).writer.run('DELETE FROM device_env_client')
  __resetRateLimitsForTests()
})

afterAll(async () => {
  await resetAllBatchers()
  __resetAnalyticsEngineForTests()
  await closeTestAnalyticsDb(analyticsHandle)
})

async function record(input: unknown, clientAddress = '127.0.0.1') {
  return call(publicAnalyticsRouter.recordDeviceEnv, input as never, {
    context: makePublicCtx({ db, clientAddress }),
  })
}

async function deviceEnvRows(): Promise<Record<string, unknown>[]> {
  await flushDeviceEnvBeacons()
  const result = await engineOf(analyticsHandle).reader.runAndReadAll(`
    SELECT event_id::VARCHAR AS eventId, screen_w AS screenW, dpr, pointer,
      color_scheme AS colorScheme, net_effective_type AS netEffectiveType,
      locale, timezone, has_static AS hasStatic
    FROM device_env_client
  `)
  return result.getRowObjects()
}

describe('public.analytics.recordDeviceEnv', () => {
  it('accepts a beacon and appends the sidecar row', async () => {
    expect(
      await record({
        eventId: EVENT_ID,
        hasStatic: true,
        screenW: 2560,
        dpr: 2,
        pointer: 'fine',
        colorScheme: 'dark',
        netEffectiveType: '4g',
        locale: 'zh-CN',
        timezone: 'Asia/Shanghai',
      }),
    ).toEqual({ accepted: true })
    expect(await deviceEnvRows()).toEqual([
      {
        eventId: EVENT_ID,
        screenW: 2560,
        dpr: 2,
        pointer: 'fine',
        colorScheme: 'dark',
        netEffectiveType: '4g',
        locale: 'zh-CN',
        timezone: 'Asia/Shanghai',
        hasStatic: true,
      },
    ])
  })

  it('accepts an orphan event id by design', async () => {
    const orphan = '00000000-0000-4000-8000-00000000dead'
    expect(await record({ eventId: orphan, hasStatic: false })).toEqual({ accepted: true })
    expect((await deviceEnvRows())[0]).toMatchObject({ eventId: orphan, hasStatic: false })
  })

  it('deduplicates a replayed beacon', async () => {
    const input = { eventId: EVENT_ID, hasStatic: true, locale: 'zh-CN' }
    await record(input)
    await record(input)
    expect(await deviceEnvRows()).toHaveLength(1)
  })

  it.each([
    { eventId: 'not-a-uuid', hasStatic: true },
    { eventId: EVENT_ID, hasStatic: true, dpr: 11 },
    { eventId: EVENT_ID, hasStatic: true, pointer: 'any' },
  ])('rejects schema-invalid payload %#', async (input) => {
    await expect(record(input)).rejects.toMatchObject({ status: 400 })
    expect(await deviceEnvRows()).toEqual([])
  })

  it('rate-limits per client IP after 120/min', async () => {
    for (let i = 0; i < 120; i += 1) {
      const eventId = `00000000-0000-4000-8000-${i.toString(16).padStart(12, '0')}`
      await record({ eventId, hasStatic: false })
    }
    await expect(record({ eventId: EVENT_ID, hasStatic: false })).rejects.toMatchObject({ status: 429 })
    expect(await record({ eventId: EVENT_ID, hasStatic: false }, '10.0.0.2')).toEqual({ accepted: true })
  })

  it('rejects declared and streamed bodies past the 4 KiB cap at the RPC perimeter', async () => {
    const app = new Hono<Env>()
    app.use('*', async (c, next) => {
      c.set('requestContext', makeRequestContext({ db }))
      await next()
    })
    app.route('/', createApiApp())
    const payload = JSON.stringify({ json: { eventId: EVENT_ID, hasStatic: true, locale: 'x'.repeat(8_192) } })
    const declared = await app.request('/rpc/public/analytics/recordDeviceEnv', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: payload,
    })
    expect(declared.status).toBe(413)

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(payload))
        controller.close()
      },
    })
    const chunked = await app.request('/rpc/public/analytics/recordDeviceEnv', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: stream,
      // @ts-expect-error — Node requires duplex for a stream body
      duplex: 'half',
    })
    expect(chunked.status).toBe(413)
  })
})
