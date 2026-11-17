// OTLP export health tracking (SDK-free).
//
// The runtime phase only reflects START-time success: a batch processor drops
// telemetry silently while OpenObserve is unreachable, so without this module
// the admin status would show `running` during a prolonged outage. Every
// production exporter is wrapped by `observeExporter`, which reports each
// export outcome here; the latest failure per signal is exposed through
// `lastExportFailure()` for the runtime-manager status projection. A success
// clears that signal's entry, so the display self-heals on recovery.
//
// The token guard mirrors `frontend-gate.ts`: recording is dropped unless the
// caller's token belongs to the currently activated runtime, so a stopping
// runtime's final flush can never clobber its replacement's health.

export type ExportSignal = 'traces' | 'metrics' | 'logs'

export interface ExportFailure {
  signal: ExportSignal
  /** Error class name only — never a message, which could carry a URL or a credential. */
  error: string
  /** Epoch milliseconds of the latest failed export for the signal. */
  at: number
}

interface HealthState {
  token: object
  failures: Map<ExportSignal, ExportFailure>
}

let current: HealthState | null = null

/** Activate tracking for a freshly started runtime, discarding any prior state. */
export function activateExportHealth(token: object): void {
  current = { token, failures: new Map() }
}

/** Deactivate only when the caller owns the active slot (HMR-safe). */
export function deactivateExportHealth(token: object): void {
  if (current?.token === token) {
    current = null
  }
}

/** Record one export outcome; ignored while the caller's runtime is not the active one. */
export function recordExportOutcome(token: object, signal: ExportSignal, exported: boolean, error?: unknown): void {
  if (current === null || current.token !== token) {
    return
  }
  if (exported) {
    current.failures.delete(signal)
    return
  }
  current.failures.set(signal, {
    signal,
    error: error instanceof Error ? error.name : typeof error,
    at: Date.now(),
  })
}

/** The most recently recorded failure across signals, or null while every signal exports cleanly. */
export function lastExportFailure(): ExportFailure | null {
  if (current === null) {
    return null
  }
  let latest: ExportFailure | null = null
  for (const failure of current.failures.values()) {
    // `>=`: a later record in the same millisecond is still the newer one.
    if (latest === null || failure.at >= latest.at) {
      latest = failure
    }
  }
  return latest
}

interface ExportResultLike {
  /** OTel `ExportResultCode`: 0 = SUCCESS, 1 = FAILED (kept numeric to stay SDK-free). */
  code: number
  error?: unknown
}

interface ExporterLike {
  export(items: unknown, resultCallback: (result: ExportResultLike) => void): void
  shutdown(): Promise<void>
  forceFlush?(): Promise<void>
}

const EXPORT_RESULT_SUCCESS = 0

/**
 * Wrap an OTLP exporter so every export outcome is recorded. Structural on
 * purpose: the span/metric/log exporter contracts share the `export` +
 * `shutdown` (+ optional `forceFlush`) shape, and this module must not import
 * an SDK to name them.
 */
export function observeExporter<T extends ExporterLike>(exporter: T, token: object, signal: ExportSignal): T {
  const innerForceFlush = exporter.forceFlush?.bind(exporter)
  const wrapped: ExporterLike = {
    export(items, resultCallback) {
      exporter.export(items, (result) => {
        try {
          recordExportOutcome(token, signal, result.code === EXPORT_RESULT_SUCCESS, result.error)
        } catch {
          // Health tracking must never break an export callback.
        }
        resultCallback(result)
      })
    },
    shutdown: () => exporter.shutdown(),
    ...(innerForceFlush !== undefined ? { forceFlush: () => innerForceFlush() } : {}),
  }
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the wrapper IS the exporter contract at runtime; TS cannot see T past the structural shape
  return wrapped as T
}

/** Test-only: drop the active slot and every recorded failure. */
export function __resetExportHealthForTests(): void {
  current = null
}
