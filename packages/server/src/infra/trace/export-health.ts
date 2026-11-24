export type ExportSignal = 'traces' | 'metrics' | 'logs'

export interface ExportFailure {
  signal: ExportSignal
  error: string
  at: number
}

interface HealthState {
  token: object
  failures: Map<ExportSignal, ExportFailure>
}

let current: HealthState | null = null

export function activateExportHealth(token: object): void {
  current = { token, failures: new Map() }
}

export function deactivateExportHealth(token: object): void {
  if (current?.token === token) {
    current = null
  }
}

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

export function lastExportFailure(): ExportFailure | null {
  if (current === null) {
    return null
  }
  let latest: ExportFailure | null = null
  for (const failure of current.failures.values()) {
    if (latest === null || failure.at >= latest.at) {
      latest = failure
    }
  }
  return latest
}

interface ExportResultLike {
  code: number
  error?: unknown
}

interface ExporterLike {
  export(items: unknown, resultCallback: (result: ExportResultLike) => void): void
  shutdown(): Promise<void>
  forceFlush?(): Promise<void>
}

const EXPORT_RESULT_SUCCESS = 0

export function observeExporter<T extends ExporterLike>(exporter: T, token: object, signal: ExportSignal): T {
  const innerForceFlush = exporter.forceFlush?.bind(exporter)
  const wrapped: ExporterLike = {
    export(items, resultCallback) {
      exporter.export(items, (result) => {
        try {
          recordExportOutcome(token, signal, result.code === EXPORT_RESULT_SUCCESS, result.error)
        } catch {}
        resultCallback(result)
      })
    },
    shutdown: () => exporter.shutdown(),
    ...(innerForceFlush !== undefined ? { forceFlush: () => innerForceFlush() } : {}),
  }
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  return wrapped as T
}

export function __resetExportHealthForTests(): void {
  current = null
}
