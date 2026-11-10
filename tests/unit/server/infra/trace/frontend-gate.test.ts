import { InMemorySpanExporter } from '@opentelemetry/sdk-trace'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ServerTraceRuntimeConfig, TraceConfigResolution } from '@/server/infra/trace/config'
import type { FrontendRumBootstrap } from '@/shared/contracts/trace'

import { TestMetricReader } from '#/_helpers/in-memory-metric-reader'
import { __resetTraceFacadeForTests } from '@/server/infra/trace/facade'
import {
  __resetFrontendGateForTests,
  activateFrontendGate,
  deactivateFrontendGate,
  verifiedFrontendBootstrap,
} from '@/server/infra/trace/frontend-gate'
import { isDevTraceRunning, startDevTrace, stopDevTrace } from '@/server/infra/trace/runtime'

const CONFIG: ServerTraceRuntimeConfig = {
  endpoint: 'http://127.0.0.1:5080',
  organization: 'default',
  authorizationHeader: 'Basic dGVzdDp0ZXN0',
  sampleRate: 1,
  includeRedactedSql: false,
  otlpTracesUrl: 'http://127.0.0.1:5080/api/default/v1/traces',
  otlpMetricsUrl: 'http://127.0.0.1:5080/api/default/v1/metrics',
  logs: null,
}

const BOOTSTRAP: FrontendRumBootstrap = {
  site: 'http://127.0.0.1:5080',
  organization: 'default',
  applicationId: 'kobato-dev',
  clientToken: 'rum-token',
  service: 'kobato',
  environment: 'development',
  sessionSampleRate: 100,
}

function resolution(): TraceConfigResolution {
  return { status: 'active', server: CONFIG, frontend: BOOTSTRAP, diagnostics: [] }
}

beforeEach(() => {
  vi.stubEnv('DEV', true as never)
  vi.stubEnv('PROD', false as never)
  __resetTraceFacadeForTests()
  __resetFrontendGateForTests()
})

afterEach(async () => {
  await stopDevTrace()
  __resetTraceFacadeForTests()
  __resetFrontendGateForTests()
  vi.unstubAllEnvs()
})

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function start(
  verifyFrontendPipeline: () => Promise<boolean>,
  frontendVerifyTimeoutMs = 200,
  frontendRecheckIntervalMs?: number,
) {
  return startDevTrace({
    resolution: resolution(),
    spanExporter: new InMemorySpanExporter(),
    metricReader: new TestMetricReader(),
    verifyFrontendPipeline,
    frontendVerifyTimeoutMs,
    frontendRecheckIntervalMs,
  })
}

describe('frontend RUM verification gate', () => {
  it('activates the browser bootstrap only after a successful pipeline verification', async () => {
    const handle = await start(async () => true)

    expect(handle.started).toBe(true)
    expect(verifiedFrontendBootstrap()).toEqual(BOOTSTRAP)
    await stopDevTrace()
    expect(verifiedFrontendBootstrap()).toBeNull()
  })

  it('withholds the bootstrap on verifier failure while server tracing stays active', async () => {
    await start(async () => false)

    expect(verifiedFrontendBootstrap()).toBeNull()
    expect(isDevTraceRunning()).toBe(true)
  })

  it('times out a hung verifier without failing startup', async () => {
    const started = Date.now()
    await start(() => new Promise<boolean>(() => undefined), 40)

    expect(Date.now() - started).toBeLessThan(1000)
    expect(verifiedFrontendBootstrap()).toBeNull()
    expect(isDevTraceRunning()).toBe(true)
  })

  it('does not let a stopped runtime clear a newer gate', () => {
    const oldToken = {}
    const newToken = {}
    activateFrontendGate(oldToken, BOOTSTRAP)
    activateFrontendGate(newToken, BOOTSTRAP)
    deactivateFrontendGate(oldToken)
    expect(verifiedFrontendBootstrap()).toEqual(BOOTSTRAP)
    deactivateFrontendGate(newToken)
    expect(verifiedFrontendBootstrap()).toBeNull()
  })

  it('periodically revokes a failed gate, restores on recovery, and clears its interval', async () => {
    let allowed = true
    let calls = 0
    const handle = await start(
      async () => {
        calls += 1
        return allowed
      },
      200,
      20,
    )
    expect(handle.started).toBe(true)
    expect(verifiedFrontendBootstrap()).not.toBeNull()

    allowed = false
    await sleep(80)
    expect(verifiedFrontendBootstrap()).toBeNull()

    allowed = true
    await sleep(80)
    expect(verifiedFrontendBootstrap()).not.toBeNull()

    await stopDevTrace()
    const callsAtStop = calls
    await sleep(80)
    expect(calls).toBe(callsAtStop)
  })

  it('re-verifies after stop and restart', async () => {
    await start(async () => true)
    expect(verifiedFrontendBootstrap()).not.toBeNull()
    await stopDevTrace()
    expect(verifiedFrontendBootstrap()).toBeNull()

    await start(async () => true)
    expect(verifiedFrontendBootstrap()).not.toBeNull()
  })
})
