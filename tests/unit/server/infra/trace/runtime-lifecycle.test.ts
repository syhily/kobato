import type { ObservableGauge } from '@opentelemetry/api'
import type { ELDHistogram } from 'node:perf_hooks'

import { InMemorySpanExporter } from '@opentelemetry/sdk-trace'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ServerTraceRuntimeConfig, TraceConfigResolution } from '@/server/infra/trace/config'

import { TestMetricReader, dataPointsOf } from '#/_helpers/in-memory-metric-reader'
import { __getLifecycleContainer, registerShutdownHook, unregisterShutdownHook } from '@/server/infra/lifecycle'
import { __resetTraceFacadeForTests, counter, isTraceActive, uninstallTraceDelegate } from '@/server/infra/trace/facade'
import { METRIC } from '@/server/infra/trace/metrics'
import { isDevTraceRunning, startDevTrace, stopDevTrace } from '@/server/infra/trace/runtime'
import { isSqliteQueryTraceSubscribed, startSqliteQueryTrace, stopSqliteQueryTrace } from '@/server/infra/trace/sqlite'

const CONFIG: ServerTraceRuntimeConfig = {
  endpoint: 'http://127.0.0.1:5080',
  organization: 'default',
  authorizationHeader: 'Basic dGVzdDp0ZXN0',
  sampleRate: 1,
  includeRedactedSql: false,
  otlpTracesUrl: 'http://127.0.0.1:5080/api/default/v1/traces',
  otlpMetricsUrl: 'http://127.0.0.1:5080/api/default/v1/metrics',
}

function resolution(): TraceConfigResolution {
  return { status: 'active', server: CONFIG, frontend: null, diagnostics: [] }
}

function fakeMonitor(): { monitor: ELDHistogram; enable: ReturnType<typeof vi.fn>; disable: ReturnType<typeof vi.fn> } {
  const enable = vi.fn()
  const disable = vi.fn()
  return { monitor: { enable, disable, mean: 1 } as unknown as ELDHistogram, enable, disable }
}

function fakeGauge(addCallback: (callback: unknown) => void = vi.fn()): ObservableGauge {
  return { addCallback } as unknown as ObservableGauge
}

beforeEach(() => {
  vi.stubEnv('DEV', true as never)
  vi.stubEnv('PROD', false as never)
  __resetTraceFacadeForTests()
  stopSqliteQueryTrace()
})

afterEach(async () => {
  await stopDevTrace()
  stopSqliteQueryTrace()
  __resetTraceFacadeForTests()
  vi.unstubAllEnvs()
})

describe('trace runtime lifecycle — event-loop observer failure', () => {
  it('disables an enabled monitor exactly once when gauge creation throws, and can restart', async () => {
    const failed = fakeMonitor()
    const reader = new TestMetricReader()
    const failedHandle = await startDevTrace({
      resolution: resolution(),
      spanExporter: new InMemorySpanExporter(),
      metricReader: reader,
      eventLoopObserver: {
        createMonitor: () => failed.monitor,
        createGauge: () => {
          throw new Error('gauge creation failed')
        },
      },
    })

    expect(failedHandle.started).toBe(true)
    expect(isDevTraceRunning()).toBe(true)
    expect(failed.enable).toHaveBeenCalledTimes(1)
    expect(failed.disable).toHaveBeenCalledTimes(1)

    // Observer failure degrades to "no event-loop gauge", not "no metrics".
    counter(METRIC.httpServerRequests).add(1, {
      'http.request.method': 'GET',
      'http.route': '/',
      'http.response.status_code': 200,
    })
    const metrics = await reader.collectResourceMetrics()
    expect(dataPointsOf(metrics, METRIC.httpServerRequests)).toHaveLength(1)
    expect(dataPointsOf(metrics, METRIC.eventLoopDelay)).toHaveLength(0)

    await failedHandle.shutdown()
    expect(failed.disable).toHaveBeenCalledTimes(1)

    const healthy = fakeMonitor()
    const restarted = await startDevTrace({
      resolution: resolution(),
      spanExporter: new InMemorySpanExporter(),
      metricReader: new TestMetricReader(),
      eventLoopObserver: {
        createMonitor: () => healthy.monitor,
        createGauge: () => fakeGauge(),
      },
    })

    expect(restarted.started).toBe(true)
    expect(failed.disable).toHaveBeenCalledTimes(1)
    expect(healthy.enable).toHaveBeenCalledTimes(1)

    await stopDevTrace()
    expect(healthy.disable).toHaveBeenCalledTimes(1)
  })

  it('disables the registered monitor when enable itself throws', async () => {
    const failed = fakeMonitor()
    failed.enable.mockImplementationOnce(() => {
      throw new Error('enable failed')
    })
    const handle = await startDevTrace({
      resolution: resolution(),
      spanExporter: new InMemorySpanExporter(),
      metricReader: new TestMetricReader(),
      eventLoopObserver: {
        createMonitor: () => failed.monitor,
        createGauge: () => fakeGauge(),
      },
    })

    expect(handle.started).toBe(true)
    expect(failed.enable).toHaveBeenCalledTimes(1)
    expect(failed.disable).toHaveBeenCalledTimes(1)

    await handle.shutdown()
    expect(failed.disable).toHaveBeenCalledTimes(1)
  })

  it('disables an enabled monitor exactly once when addCallback throws', async () => {
    const failed = fakeMonitor()
    const addCallback = vi.fn(() => {
      throw new Error('addCallback failed')
    })
    const handle = await startDevTrace({
      resolution: resolution(),
      spanExporter: new InMemorySpanExporter(),
      metricReader: new TestMetricReader(),
      eventLoopObserver: {
        createMonitor: () => failed.monitor,
        createGauge: () => fakeGauge(addCallback),
      },
    })

    expect(handle.started).toBe(true)
    expect(addCallback).toHaveBeenCalledTimes(1)
    expect(failed.enable).toHaveBeenCalledTimes(1)
    expect(failed.disable).toHaveBeenCalledTimes(1)

    await handle.shutdown()
    expect(failed.disable).toHaveBeenCalledTimes(1)
  })
})

describe('trace runtime lifecycle — stop cleanup isolation', () => {
  it('continues every cleanup step after failures, never rejects, and is idempotent', async () => {
    const monitor = fakeMonitor()
    const uninstall = vi.fn((delegate) => {
      uninstallTraceDelegate(delegate)
      throw new Error('uninstall failed')
    })
    const unregister = vi.fn((hook) => {
      unregisterShutdownHook(hook)
      throw new Error('unregister failed')
    })
    const stopSqlite = vi.fn(() => {
      stopSqliteQueryTrace()
      throw new Error('sqlite stop failed')
    })
    const disableMonitor = vi.fn((value: ELDHistogram | null) => {
      value?.disable()
      throw new Error('monitor disable failed')
    })
    const hookBaseline = __getLifecycleContainer().hooks.length

    const handle = await startDevTrace({
      resolution: resolution(),
      spanExporter: new InMemorySpanExporter(),
      metricReader: new TestMetricReader(),
      eventLoopObserver: {
        createMonitor: () => monitor.monitor,
        createGauge: () => fakeGauge(),
      },
      lifecycle: {
        uninstallTraceDelegate: uninstall,
        unregisterShutdownHook: unregister,
        stopSqliteQueryTrace: stopSqlite,
        disableMonitor,
      },
    })

    expect(handle.started).toBe(true)
    expect(__getLifecycleContainer().hooks).toHaveLength(hookBaseline + 1)

    await expect(stopDevTrace()).resolves.toBeUndefined()

    expect(uninstall).toHaveBeenCalledTimes(1)
    expect(unregister).toHaveBeenCalledTimes(1)
    expect(stopSqlite).toHaveBeenCalledTimes(1)
    expect(disableMonitor).toHaveBeenCalledTimes(1)
    expect(monitor.disable).toHaveBeenCalledTimes(1)
    expect(isDevTraceRunning()).toBe(false)
    expect(isTraceActive()).toBe(false)
    expect(isSqliteQueryTraceSubscribed()).toBe(false)
    expect(__getLifecycleContainer().hooks).toHaveLength(hookBaseline)

    // Repeated stop/shutdown is a no-op; nothing throws into HMR disposal.
    await stopDevTrace()
    await handle.shutdown()
    expect(uninstall).toHaveBeenCalledTimes(1)
    expect(monitor.disable).toHaveBeenCalledTimes(1)
  })
})

describe('trace runtime lifecycle — startup rollback', () => {
  it('rolls back every resource when the SQLite subscriber throws, and can restart', async () => {
    const monitor = fakeMonitor()
    const reader = new TestMetricReader()
    const readerShutdown = vi.spyOn(reader, 'shutdown')
    const hookBaseline = __getLifecycleContainer().hooks.length

    const handle = await startDevTrace({
      resolution: resolution(),
      spanExporter: new InMemorySpanExporter(),
      metricReader: reader,
      eventLoopObserver: {
        createMonitor: () => monitor.monitor,
        createGauge: () => fakeGauge(),
      },
      lifecycle: {
        startSqliteQueryTrace: (options) => {
          startSqliteQueryTrace({ ...options, enabledInTests: true })
          throw new Error('sqlite subscription failed')
        },
      },
    })

    expect(handle.started).toBe(false)
    expect(isDevTraceRunning()).toBe(false)
    expect(isTraceActive()).toBe(false)
    expect(isSqliteQueryTraceSubscribed()).toBe(false)
    expect(monitor.disable).toHaveBeenCalledTimes(1)
    expect(readerShutdown).toHaveBeenCalled()
    expect(__getLifecycleContainer().hooks).toHaveLength(hookBaseline)

    // Idempotent inert handle after rollback.
    await handle.shutdown()
    await handle.forceFlush()
    expect(monitor.disable).toHaveBeenCalledTimes(1)

    const restarted = await startDevTrace({
      resolution: resolution(),
      spanExporter: new InMemorySpanExporter(),
      metricReader: new TestMetricReader(),
    })
    expect(restarted.started).toBe(true)
    expect(isDevTraceRunning()).toBe(true)
    await stopDevTrace()
    expect(isDevTraceRunning()).toBe(false)
  })

  it('unregisters a hook registered before a throwing registration and cleans the rest', async () => {
    const monitor = fakeMonitor()
    const reader = new TestMetricReader()
    const readerShutdown = vi.spyOn(reader, 'shutdown')
    const hookBaseline = __getLifecycleContainer().hooks.length

    const handle = await startDevTrace({
      resolution: resolution(),
      spanExporter: new InMemorySpanExporter(),
      metricReader: reader,
      eventLoopObserver: {
        createMonitor: () => monitor.monitor,
        createGauge: () => fakeGauge(),
      },
      lifecycle: {
        startSqliteQueryTrace: (options) => {
          startSqliteQueryTrace({ ...options, enabledInTests: true })
        },
        registerShutdownHook: (hook, priority) => {
          registerShutdownHook(hook, priority)
          throw new Error('hook registration failed')
        },
      },
    })

    expect(handle.started).toBe(false)
    expect(isDevTraceRunning()).toBe(false)
    expect(isTraceActive()).toBe(false)
    expect(isSqliteQueryTraceSubscribed()).toBe(false)
    expect(monitor.disable).toHaveBeenCalledTimes(1)
    expect(readerShutdown).toHaveBeenCalled()
    expect(__getLifecycleContainer().hooks).toHaveLength(hookBaseline)

    const restarted = await startDevTrace({
      resolution: resolution(),
      spanExporter: new InMemorySpanExporter(),
      metricReader: new TestMetricReader(),
    })
    expect(restarted.started).toBe(true)
    await stopDevTrace()
    expect(__getLifecycleContainer().hooks).toHaveLength(hookBaseline)
  })
})
