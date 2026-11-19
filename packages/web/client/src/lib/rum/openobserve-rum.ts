import type { FrontendRumBootstrap } from '@kobato/telemetry/rum.ts'
import type { RumBudgetSnapshot, RumBudgetStore } from '@kobato/web-client/lib/rum/rum-budget.ts'
import type { RumRouteContext } from '@kobato/web-client/lib/rum/rum-route.ts'
import type { DatadogRum, RumInitConfiguration } from '@openobserve/browser-rum-slim'

import { APP_VERSION } from '@kobato/distribution/app.ts'
import { RUM_INTAKE_PATH, RUM_RELAY_CLIENT_TOKEN } from '@kobato/telemetry/rum.ts'
import { getLogger } from '@kobato/ui/lib/logger.ts'
import { createRumEventPolicy } from '@kobato/web-client/lib/rum/rum-sanitizer.ts'
import { isSelfTelemetryRumUrl, isTraceableRumUrl } from '@kobato/web-client/lib/rum/rum-url-policy.ts'

const log = getLogger('rum')

interface RumRuntimeState {
  status: 'idle' | 'starting' | 'started' | 'failed'
  startPromise: Promise<void> | null
  api: DatadogRum | null
  route: RumRouteContext | null
  pollTimer: ReturnType<typeof setInterval> | null
  pollAbort: AbortController | null
  pollGeneration: number
  pollInFlight: boolean
  consent: 'granted' | 'not-granted'
  revokedByGate: boolean
  startGeneration: number
}

const RUM_RUNTIME_KEY = Symbol.for('kobato.rum.runtime')
const BUDGET_STORAGE_KEY = 'kobato.rum.budget'
export const RUM_STATUS_PATH = '/api/rum/status'
export const RUM_STATUS_POLL_INTERVAL_MS = 10_000

function isBudgetSnapshot(value: unknown): value is RumBudgetSnapshot {
  if (value === null || typeof value !== 'object') {
    return false
  }
  const sessionId: unknown = Reflect.get(value, 'sessionId')
  const resources: unknown = Reflect.get(value, 'resources')
  const errors: unknown = Reflect.get(value, 'errors')
  return (
    typeof sessionId === 'string' &&
    typeof resources === 'number' &&
    Number.isInteger(resources) &&
    resources >= 0 &&
    typeof errors === 'number' &&
    Number.isInteger(errors) &&
    errors >= 0
  )
}

function browserBudgetStore(): RumBudgetStore {
  return {
    load() {
      try {
        const raw = globalThis.sessionStorage.getItem(BUDGET_STORAGE_KEY)
        if (raw === null) {
          return null
        }
        const parsed: unknown = JSON.parse(raw)
        return isBudgetSnapshot(parsed) ? parsed : null
      } catch {
        return null
      }
    },
    save(snapshot) {
      try {
        globalThis.sessionStorage.setItem(BUDGET_STORAGE_KEY, JSON.stringify(snapshot))
      } catch {}
    },
  }
}

function isRumRuntimeState(value: unknown): value is RumRuntimeState {
  if (value === null || typeof value !== 'object') {
    return false
  }
  const status: unknown = Reflect.get(value, 'status')
  return status === 'idle' || status === 'starting' || status === 'started' || status === 'failed'
}

function runtime(): RumRuntimeState {
  const existing = Reflect.get(globalThis, RUM_RUNTIME_KEY) as unknown
  if (isRumRuntimeState(existing)) {
    return existing
  }
  const state: RumRuntimeState = {
    status: 'idle',
    startPromise: null,
    api: null,
    route: null,
    pollTimer: null,
    pollAbort: null,
    pollGeneration: 0,
    pollInFlight: false,
    consent: 'granted',
    revokedByGate: false,
    startGeneration: 0,
  }
  Reflect.set(globalThis, RUM_RUNTIME_KEY, state)
  return state
}

export function __resetRumForTests(): void {
  const existing = Reflect.get(globalThis, RUM_RUNTIME_KEY) as unknown
  if (isRumRuntimeState(existing)) {
    stopStatusPolling(existing)
  }
  Reflect.deleteProperty(globalThis, RUM_RUNTIME_KEY)
}

function documentOrigin(): string | null {
  const location = globalThis.location
  if (location === undefined) {
    return null
  }
  try {
    const url = new URL(location.origin)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.origin : null
  } catch {
    return null
  }
}

export function rumIntakeProxyUrl({ path, parameters }: { path: string; parameters: string }): string {
  const origin = documentOrigin()
  return `${origin ?? ''}${RUM_INTAKE_PATH}${path}?${parameters}`
}

function isTrackingAllowed(): boolean {
  const nav = globalThis.navigator
  if (nav === undefined) {
    return true
  }
  return nav.doNotTrack !== '1' && Reflect.get(nav, 'globalPrivacyControl') !== true
}

function stopStatusPolling(state: RumRuntimeState): void {
  state.pollGeneration += 1
  if (state.pollTimer !== null) {
    clearInterval(state.pollTimer)
    state.pollTimer = null
  }
  state.pollAbort?.abort()
  state.pollAbort = null
  state.pollInFlight = false
}

async function pollStatus(state: RumRuntimeState): Promise<void> {
  if (state.status !== 'started' || state.api === null || state.pollInFlight) {
    return
  }
  const generation = state.pollGeneration
  state.pollInFlight = true
  const controller = new AbortController()
  state.pollAbort?.abort()
  state.pollAbort = controller
  try {
    const res = await fetch(RUM_STATUS_PATH, {
      cache: 'no-store',
      credentials: 'same-origin',
      headers: { accept: 'application/json' },
      redirect: 'manual',
      signal: controller.signal,
    })
    if (!res.ok) {
      throw new Error(`status ${res.status}`)
    }
    const payload: unknown = await res.json()
    const enabled: unknown = typeof payload === 'object' && payload !== null ? Reflect.get(payload, 'enabled') : null
    if (typeof enabled !== 'boolean') {
      throw new TypeError('invalid status payload')
    }
    if (generation !== state.pollGeneration || state.status !== 'started' || state.api === null) {
      return
    }
    const consent = enabled && isTrackingAllowed() ? 'granted' : 'not-granted'
    const lostConsent = state.consent === 'granted' && consent === 'not-granted'
    const shouldResumeView = consent === 'granted' && state.revokedByGate
    state.consent = consent
    state.revokedByGate = consent !== 'granted'
    if (lostConsent) {
      try {
        state.api.stopSession()
      } catch {}
    }
    state.api.setTrackingConsent(consent)
    if (shouldResumeView) {
      try {
        state.api.startView(state.route?.id ?? 'unknown')
      } catch {}
    }
  } catch {
    if (generation === state.pollGeneration && state.status === 'started' && state.api !== null) {
      const lostConsent = state.consent === 'granted'
      state.consent = 'not-granted'
      state.revokedByGate = true
      if (lostConsent) {
        try {
          state.api.stopSession()
        } catch {}
      }
      state.api.setTrackingConsent('not-granted')
    }
  } finally {
    if (state.pollAbort === controller) {
      state.pollAbort = null
    }
    state.pollInFlight = false
  }
}

function startStatusPolling(state: RumRuntimeState): void {
  stopStatusPolling(state)
  const generation = state.pollGeneration
  state.pollTimer = setInterval(() => {
    if (generation === state.pollGeneration) {
      void pollStatus(state)
    }
  }, RUM_STATUS_POLL_INTERVAL_MS)
  void pollStatus(state)
}

export function suspendRum(): void {
  const state = runtime()
  const lostConsent = state.consent === 'granted'
  state.consent = 'not-granted'
  state.revokedByGate = true
  if (state.status !== 'started' || state.api === null) {
    return
  }
  if (lostConsent) {
    try {
      state.api.stopSession()
    } catch {}
  }
  state.api.setTrackingConsent('not-granted')
  if (state.pollTimer === null) {
    startStatusPolling(state)
  }
}

export function stopRum(): void {
  const state = runtime()
  stopStatusPolling(state)
  state.startGeneration = (state.startGeneration ?? 0) + 1
  state.consent = 'not-granted'
  state.revokedByGate = true
  state.api?.setTrackingConsent('not-granted')
  state.status = 'idle'
  state.api = null
  state.startPromise = null
  state.route = null
}

export async function __pollRumStatusForTests(): Promise<void> {
  await pollStatus(runtime())
}

export async function startRum(bootstrap: FrontendRumBootstrap, route: RumRouteContext): Promise<void> {
  const state = runtime()
  state.route = route

  if (state.status === 'failed') {
    return
  }
  if (state.status === 'started') {
    state.api?.setViewName(route.id)
    startStatusPolling(state)
    return
  }
  if (state.startPromise !== null) {
    await state.startPromise
    const settled = runtime()
    if (settled.status === 'started') {
      settled.api?.setViewName(settled.route?.id ?? route.id)
    }
    return
  }

  if (state.status === 'idle') {
    state.consent = 'granted'
    state.revokedByGate = false
  }
  state.status = 'starting'
  state.startGeneration = (state.startGeneration ?? 0) + 1
  const generation = state.startGeneration
  const starting = initialize(state, bootstrap, generation)
  state.startPromise = starting
  try {
    await starting
  } finally {
    const settled = runtime()
    settled.startPromise = null
  }
}

async function initialize(state: RumRuntimeState, bootstrap: FrontendRumBootstrap, generation: number): Promise<void> {
  const origin = documentOrigin()
  if (origin === null) {
    state.status = 'failed'
    return
  }

  try {
    const module = await import('@openobserve/browser-rum-slim')
    if (state.startGeneration !== generation || state.status !== 'starting') {
      return
    }
    const desiredConsent = state.consent

    const policy = createRumEventPolicy({
      getScope: () => {
        const route = runtime().route
        return route === null ? null : { origin, route }
      },
      budgetStore: browserBudgetStore(),
      service: bootstrap.service,
      version: APP_VERSION,
    })

    const initConfiguration: RumInitConfiguration = {
      applicationId: bootstrap.applicationId,
      clientToken: RUM_RELAY_CLIENT_TOKEN,
      proxy: rumIntakeProxyUrl,
      service: bootstrap.service,
      env: bootstrap.environment,
      version: APP_VERSION,
      sessionSampleRate: bootstrap.sessionSampleRate,
      telemetrySampleRate: 0,
      telemetryConfigurationSampleRate: 0,
      telemetryUsageSampleRate: 0,
      sessionReplaySampleRate: 0,
      startSessionReplayRecordingManually: true,
      defaultPrivacyLevel: 'mask',
      trackResources: true,
      trackLongTasks: true,
      trackUserInteractions: false,
      trackAnonymousUser: false,
      trackResourceHeaders: false,
      propagateTraceBaggage: false,
      compressIntakeRequests: false,
      profilingSampleRate: 0,
      silentMultipleInit: true,
      traceSampleRate: 100,
      traceContextInjection: 'sampled',
      trackingConsent: desiredConsent,
      allowedTracingUrls: [
        {
          match: (url: string) => isTraceableRumUrl(url, origin),
          propagatorTypes: ['tracecontext'],
        },
      ],
      excludedActivityUrls: [(url: string) => isSelfTelemetryRumUrl(url, origin)],
      beforeSend: policy.beforeSend,
    }

    module.openobserveRum.init(initConfiguration)
    state.api = module.openobserveRum
    state.status = 'started'
    state.consent = desiredConsent
    state.revokedByGate = desiredConsent !== 'granted'
    if (desiredConsent !== 'granted') {
      state.api.setTrackingConsent('not-granted')
    }
    if (state.route !== null) {
      state.api.setViewName(state.route.id)
    }
    startStatusPolling(state)
  } catch {
    state.status = 'failed'
    state.api = null
    log.debug('OpenObserve RUM initialization failed; browser telemetry stays disabled')
  }
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => stopRum())
}
