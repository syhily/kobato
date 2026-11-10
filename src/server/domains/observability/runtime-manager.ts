// Observability runtime orchestration (Platform domain, leaf).
//
// The settings section is the single source of truth: this module maps it onto
// the infra trace input, decides whether the configuration may activate, and
// hot-applies fingerprint changes. Every failure stays contained here —
// telemetry must never affect the site's availability.

import type { ObservabilitySettingsSlice } from '@/server/domains/observability/config'
import type { TraceConfigResolution } from '@/server/infra/trace/config'
import type { ExportFailure } from '@/server/infra/trace/export-health'

import {
  observabilityConnectionFingerprint,
  observabilityRuntimeFingerprint,
  toTraceRuntimeSettings,
} from '@/server/domains/observability/config'
import { syncObservabilityRetention } from '@/server/domains/observability/retention'
import { getLogger } from '@/server/infra/logger'
import { logTraceDiagnostics, resolveTraceConfig, traceEnvironment } from '@/server/infra/trace/config'
import { lastExportFailure } from '@/server/infra/trace/export-health'
import { getBlogSettingsBundleSync } from '@/shared/config/getters'
import { isRecord } from '@/shared/utils/type-guards'

const log = getLogger('observability')

export type ObservabilityRuntimePhase = 'disabled' | 'unverified' | 'invalid' | 'running' | 'failed'

export interface ObservabilityRuntimeStatus {
  phase: ObservabilityRuntimePhase
  /**
   * Runtime fingerprint (every pipeline-affecting setting) of the currently
   * applied configuration, `null` before the first sync. Verification compares
   * the CONNECTION fingerprint instead — see `observabilityConnectionFingerprint`.
   */
  fingerprint: string | null
  /** Diagnostics-free failure summary (codes / field names only, never a value). */
  lastError: string | null
  /**
   * Latest OTLP export failure reported by the running runtime's observed
   * exporters (traces/metrics/logs). Null while every signal exports cleanly
   * or no runtime is active — phase alone cannot see an upstream outage, this
   * can.
   */
  lastExportError: ExportFailure | null
}

interface RuntimeState {
  phase: ObservabilityRuntimePhase
  fingerprint: string | null
  lastError: string | null
  /** True while this module instance believes a provider is installed. */
  started: boolean
}

let state: RuntimeState = { phase: 'disabled', fingerprint: null, lastError: null, started: false }
let queue: Promise<void> = Promise.resolve()

function errorName(error: unknown): string {
  return error instanceof Error ? error.name : typeof error
}

/**
 * HMR forgets this module's state while the (separately disposed) infra runtime
 * may still be installed. `import.meta.hot.data` survives the reload, so the
 * next instance knows a stop is needed before re-applying.
 */
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

/**
 * Streams are created lazily by first ingest, which only happens AFTER the
 * runtime starts — the boot/save retention passes cannot see them yet. One
 * delayed pass after entering `running` picks those streams up; the retention
 * sync itself is a no-op unless a positive `retentionDays` is configured.
 */
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
    const { stopTraceRuntime } = await import('@/server/infra/trace/runtime')
    await stopTraceRuntime()
  } catch (error) {
    log.warn('OpenObserve runtime stop failed; continuing with the remaining settings update', {
      error: errorName(error),
    })
  } finally {
    state = {
      ...state,
      started: false,
      // A stale `running` phase must not survive a failed stop.
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
    const { startTraceRuntime } = await import('@/server/infra/trace/runtime')
    const handle = await startTraceRuntime({ resolution })
    if (!handle.started) {
      state = { phase: 'failed', fingerprint, lastError: 'trace-provider-start-failed', started: false }
      return
    }
    state = { phase: 'running', fingerprint, lastError: null, started: true }
    markHmrStarted(true)
    schedulePostStartRetentionSync()
  } catch (error) {
    // SDK chunk load / provider construction failure: the site keeps running.
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

  // Connection fingerprint gates activation (`verifiedFingerprint`); the runtime
  // fingerprint drives restart detection, so a toggled switch restarts the
  // providers without touching the verification.
  const fingerprint = observabilityRuntimeFingerprint(site)
  if (!site.enabled) {
    await stopRuntime()
    state = { phase: 'disabled', fingerprint, lastError: null, started: false }
    return
  }

  if (site.verifiedFingerprint === '' || site.verifiedFingerprint !== observabilityConnectionFingerprint(site)) {
    // Never activate a configuration an admin has not verified; the connection
    // test writes the fingerprint that unlocks this branch.
    if (state.phase !== 'unverified' || state.fingerprint !== fingerprint) {
      log.info('OpenObserve observability is configured but not verified; server telemetry stays off')
    }
    await stopRuntime()
    state = { phase: 'unverified', fingerprint, lastError: null, started: false }
    return
  }

  await startRuntime(site, fingerprint)
}

/**
 * Re-resolve from the current settings snapshot and reconcile the runtime.
 * Serialized: overlapping saves converge on the last snapshot. The returned
 * promise never rejects — a telemetry failure is recorded and logged, never
 * allowed to surface into the boot path or a settings save.
 */
export function syncObservabilityRuntime(): Promise<void> {
  const guarded = queue.then(apply).catch((error: unknown) => {
    state = { ...state, phase: 'failed', lastError: `sync-failed: ${errorName(error)}` }
    log.warn('OpenObserve settings synchronization failed', { error: errorName(error) })
  })
  queue = guarded
  return guarded
}

/** Test seam: drop the module state between cases. */
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
