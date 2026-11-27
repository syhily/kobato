import type { ObservabilitySettingsSlice } from '@kobato/server/domains/observability/config'
import type { TraceConfigResolution } from '@kobato/server/infra/trace/config'
import type { ExportFailure } from '@kobato/server/infra/trace/export-health'

import { isRecord } from '@kobato/base/utils/type-guards'
import {
  observabilityConnectionFingerprint,
  observabilityRuntimeFingerprint,
  toTraceRuntimeSettings,
} from '@kobato/server/domains/observability/config'
import { syncObservabilityRetention } from '@kobato/server/domains/observability/retention'
import { getLogger } from '@kobato/server/infra/logger'
import { logTraceDiagnostics, resolveTraceConfig, traceEnvironment } from '@kobato/server/infra/trace/config'
import { lastExportFailure } from '@kobato/server/infra/trace/export-health'
import { getBlogSettingsBundleSync } from '@kobato/settings/getters'

const log = getLogger('observability')

export type ObservabilityRuntimePhase = 'disabled' | 'unverified' | 'invalid' | 'running' | 'failed'

export interface ObservabilityRuntimeStatus {
  phase: ObservabilityRuntimePhase
  fingerprint: string | null
  lastError: string | null
  lastExportError: ExportFailure | null
}

interface RuntimeState {
  phase: ObservabilityRuntimePhase
  fingerprint: string | null
  lastError: string | null
  started: boolean
}

let state: RuntimeState = { phase: 'disabled', fingerprint: null, lastError: null, started: false }
let queue: Promise<void> = Promise.resolve()

function errorName(error: unknown): string {
  return error instanceof Error ? error.name : typeof error
}

function hmrStarted(): boolean {
  return isRecord(import.meta.hot?.data) && import.meta.hot.data.observabilityStarted === true
}

function markHmrStarted(started: boolean): void {
  const data: unknown = import.meta.hot?.data
  if (isRecord(data)) {
    data.observabilityStarted = started
  }
}

export function getObservabilityRuntimeStatus(): ObservabilityRuntimeStatus {
  return {
    phase: state.phase,
    fingerprint: state.fingerprint,
    lastError: state.lastError,
    lastExportError: lastExportFailure(),
  }
}

const POST_START_RETENTION_SYNC_DELAY_MS = 60_000
let postStartRetentionTimer: NodeJS.Timeout | null = null

function cancelPostStartRetentionSync(): void {
  if (postStartRetentionTimer !== null) {
    clearTimeout(postStartRetentionTimer)
    postStartRetentionTimer = null
  }
}

function schedulePostStartRetentionSync(): void {
  cancelPostStartRetentionSync()
  postStartRetentionTimer = setTimeout(() => {
    postStartRetentionTimer = null
    void syncObservabilityRetention()
  }, POST_START_RETENTION_SYNC_DELAY_MS)
  postStartRetentionTimer.unref?.()
}

async function stopRuntime(): Promise<void> {
  cancelPostStartRetentionSync()
  if (!state.started && !hmrStarted()) {
    return
  }
  try {
    const { stopTraceRuntime } = await import('@kobato/server/infra/trace/runtime')
    await stopTraceRuntime()
  } catch (error) {
    log.warn('OpenObserve runtime stop failed; continuing with the remaining settings update', {
      error: errorName(error),
    })
  } finally {
    state = {
      ...state,
      started: false,
      phase: state.phase === 'running' ? 'disabled' : state.phase,
    }
    markHmrStarted(false)
  }
}

function describeResolutionFailure(resolution: TraceConfigResolution): string {
  const diagnostic = resolution.diagnostics[0]
  return diagnostic === undefined ? `trace-${resolution.status}` : `${diagnostic.code}: ${diagnostic.fields.join(', ')}`
}

async function startRuntime(site: ObservabilitySettingsSlice, fingerprint: string): Promise<void> {
  const resolution = resolveTraceConfig(toTraceRuntimeSettings(site), { environment: traceEnvironment() })
  logTraceDiagnostics(resolution.diagnostics)

  if (resolution.status !== 'active' || resolution.server === null) {
    await stopRuntime()
    state = { phase: 'invalid', fingerprint, lastError: describeResolutionFailure(resolution), started: false }
    return
  }

  if (state.phase === 'running' && state.fingerprint === fingerprint && state.started) {
    return
  }

  await stopRuntime()
  try {
    const { startTraceRuntime } = await import('@kobato/server/infra/trace/runtime')
    const handle = await startTraceRuntime({ resolution })
    if (!handle.started) {
      state = { phase: 'failed', fingerprint, lastError: 'trace-provider-start-failed', started: false }
      return
    }
    state = { phase: 'running', fingerprint, lastError: null, started: true }
    markHmrStarted(true)
    schedulePostStartRetentionSync()
  } catch (error) {
    state = { phase: 'failed', fingerprint, lastError: `trace-start-failed: ${errorName(error)}`, started: false }
    markHmrStarted(false)
    log.warn('OpenObserve telemetry could not start; the site continues without it', {
      error: errorName(error),
    })
  }
}

function readSettings(): ObservabilitySettingsSlice | null {
  return getBlogSettingsBundleSync()?.observability?.observability ?? null
}

async function apply(): Promise<void> {
  const site = readSettings()
  if (site === null) {
    await stopRuntime()
    state = { phase: 'disabled', fingerprint: null, lastError: null, started: false }
    return
  }

  const fingerprint = observabilityRuntimeFingerprint(site)
  if (!site.enabled) {
    await stopRuntime()
    state = { phase: 'disabled', fingerprint, lastError: null, started: false }
    return
  }

  if (site.verifiedFingerprint === '' || site.verifiedFingerprint !== observabilityConnectionFingerprint(site)) {
    if (state.phase !== 'unverified' || state.fingerprint !== fingerprint) {
      log.info('OpenObserve observability is configured but not verified; server telemetry stays off')
    }
    await stopRuntime()
    state = { phase: 'unverified', fingerprint, lastError: null, started: false }
    return
  }

  await startRuntime(site, fingerprint)
}

export function syncObservabilityRuntime(): Promise<void> {
  const guarded = queue.then(apply).catch((error: unknown) => {
    state = { ...state, phase: 'failed', lastError: `sync-failed: ${errorName(error)}` }
    log.warn('OpenObserve settings synchronization failed', { error: errorName(error) })
  })
  queue = guarded
  return guarded
}

export function __resetObservabilityRuntimeForTests(): void {
  cancelPostStartRetentionSync()
  state = { phase: 'disabled', fingerprint: null, lastError: null, started: false }
  queue = Promise.resolve()
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    void stopRuntime()
  })
}
