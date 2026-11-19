import type { AnalyticsHandle } from '@kobato/db/duckdb/database.ts'
import type { Env } from '@kobato/server/http/hono-env.ts'

import {
  __adoptAnalyticsHandleForTests,
  __resetAnalyticsEngineForTests,
} from '@kobato/server/bootstrap/analytics-lifecycle.ts'
import { getDatabaseHandle } from '@kobato/server/bootstrap/db-lifecycle.ts'
import { flushDeviceEnvBeacons } from '@kobato/server/domains/analytics/services/env-beacon.ts'
import { analyticsEventsRouter } from '@kobato/server/http/resources/analytics.ts'
import { initAllBatchers, resetAllBatchers } from '@kobato/server/infra/db/batcher-registry.ts'
import { __resetRateLimitsForTests } from '@kobato/server/infra/rate-limit.ts'
import { closeTestAnalyticsDb, createTestAnalyticsDb } from '@kobato/test/analytics-db.ts'
import { makeRequestContext } from '@kobato/test/request-context.ts'
import { Hono } from 'hono'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'

const ENDPOINT = '/api/analytics/env'
const EVENT_ID = '00000000-0000-4000-8000-0000000000c1'

let analyticsHandle: AnalyticsHandle
let app: Hono<Env>

function buildApp(clientAddress = '127.0.0.1'): Hono<Env> {
  const scoped = new Hono<Env>()
  scoped.use('*', async (c, next) => {
    const request = new Request(`http://localhost${ENDPOINT}`, { method: 'POST' })
    c.set('requestContext', makeRequestContext({ request, clientAddress }))
    c.set('requestId', 'test-request')
    await next()
  })
  scoped.route('/', analyticsEventsRouter)
  return scoped
}

async function post(body: BodyInit): Promise<Response> {
  return app.request(ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
  })
}

async function deviceEnvRows(): Promise<Record<string, unknown>[]> {
  await flushDeviceEnvBeacons()
  const result = await analyticsHandle.reader.runAndReadAll(`
    SELECT
      event_id::VARCHAR AS eventId,
      screen_w AS screenW,
      dpr,
      pointer,
      color_scheme AS colorScheme,
      net_effective_type AS netEffectiveType,
      locale,
      timezone,
      has_static AS hasStatic
    FROM device_env_client
  `)
  return result.getRowObjects()
}

beforeEach(async () => {
  await resetAllBatchers()
  if (analyticsHandle?.closed === false) {
    await closeTestAnalyticsDb(analyticsHandle)
  }
  analyticsHandle = await createTestAnalyticsDb()
  __resetAnalyticsEngineForTests()
  __adoptAnalyticsHandleForTests(analyticsHandle)
  initAllBatchers(getDatabaseHandle())
  await analyticsHandle.writer.run('DELETE FROM device_env_client')
  __resetRateLimitsForTests()
  app = buildApp()
})

afterAll(async () => {
  await resetAllBatchers()
  __resetAnalyticsEngineForTests()
  await closeTestAnalyticsDb(analyticsHandle)
})

describe('POST /api/analytics/env', () => {
  it('accepts a beacon with 204 and appends the sidecar row', async () => {
    const res = await post(
      JSON.stringify({
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
    )

    expect(res.status).toBe(204)
    expect(res.body).toBeNull()
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

  it('accepts an orphan event id by design (no main-table lookup)', async () => {
    const orphan = '00000000-0000-4000-8000-00000000dead'
    expect((await post(JSON.stringify({ eventId: orphan, hasStatic: false }))).status).toBe(204)

    const [row] = await deviceEnvRows()
    expect(row).toEqual({
      eventId: orphan,
      screenW: null,
      dpr: null,
      pointer: '',
      colorScheme: '',
      netEffectiveType: '',
      locale: '',
      timezone: '',
      hasStatic: false,
    })
  })

  it('deduplicates a replayed beacon instead of poisoning the batch', async () => {
    const body = JSON.stringify({ eventId: EVENT_ID, hasStatic: true, locale: 'zh-CN' })
    expect((await post(body)).status).toBe(204)
    expect((await post(body)).status).toBe(204)

    expect(await deviceEnvRows()).toEqual([
      {
        eventId: EVENT_ID,
        screenW: null,
        dpr: null,
        pointer: '',
        colorScheme: '',
        netEffectiveType: '',
        locale: 'zh-CN',
        timezone: '',
        hasStatic: true,
      },
    ])
  })

  it('rejects malformed JSON and schema-invalid payloads with 400', async () => {
    expect((await post('{')).status).toBe(400)
    expect((await post(JSON.stringify({ eventId: 'not-a-uuid', hasStatic: true }))).status).toBe(400)
    expect((await post(JSON.stringify({ eventId: EVENT_ID, hasStatic: true, dpr: 11 }))).status).toBe(400)
    expect((await post(JSON.stringify({ eventId: EVENT_ID, hasStatic: true, pointer: 'any' }))).status).toBe(400)
    await flushDeviceEnvBeacons()
    expect(await deviceEnvRows()).toEqual([])
  })

  it('rejects a body past the 4 KB cap with 413', async () => {
    const res = await post(JSON.stringify({ eventId: EVENT_ID, hasStatic: true, locale: 'x'.repeat(8_192) }))
    expect(res.status).toBe(413)
  })

  it('rejects a length-less (streamed) oversized body with 413', async () => {
    const body = JSON.stringify({ eventId: EVENT_ID, hasStatic: true, locale: 'x'.repeat(8_192) })
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(body))
        controller.close()
      },
    })
    const request = new Request(`http://localhost${ENDPOINT}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: stream,
      duplex: 'half',
    } as RequestInit)

    expect((await app.request(request)).status).toBe(413)
  })

  it('rate-limits per client IP after the dedicated beacon budget (120/min)', async () => {
    for (let i = 0; i < 120; i += 1) {
      const eventId = `00000000-0000-4000-8000-${i.toString(16).padStart(12, '0')}`
      expect((await post(JSON.stringify({ eventId, hasStatic: false }))).status).toBe(204)
    }
    expect((await post(JSON.stringify({ eventId: EVENT_ID, hasStatic: false }))).status).toBe(429)

    app = buildApp('10.0.0.2')
    expect((await post(JSON.stringify({ eventId: EVENT_ID, hasStatic: false }))).status).toBe(204)
  })
})
