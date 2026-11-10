// The ONLY client module allowed to import the RUM SDK, reached exclusively
// from the `useRum` effect after the root loader verified a bootstrap.
// Every intake batch posts to the same-origin `/api/rum/intake` relay, so the
// OpenObserve endpoint and client token never reach the document — no CORS
// preflight, no CSP `connect-src` widening.

import type { DatadogRum, RumInitConfiguration } from '@openobserve/browser-rum-slim'

import type { RumBudgetSnapshot, RumBudgetStore } from '@/client/lib/rum-budget'
import type { RumRouteContext } from '@/client/lib/rum-route'
import type { FrontendRumBootstrap } from '@/shared/contracts/trace'

import { getLogger } from '@/client/lib/logger'
import { createRumEventPolicy } from '@/client/lib/rum-sanitizer'
import { isSelfTelemetryRumUrl, isTraceableRumUrl } from '@/client/lib/rum-url-policy'
import { APP_VERSION } from '@/shared/config/version'
import { RUM_INTAKE_PATH, RUM_RELAY_CLIENT_TOKEN } from '@/shared/contracts/trace'

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
  /** Incremented by every start/stop so an in-flight initialize can abort. */
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

/**
 * Session-scoped cap persistence: the SDK session id is already cookie-scoped,
 * and only two counters + that random id are stored. Blocked storage degrades
 * to the in-memory policy.
 */
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
      } catch {
        // Storage blocked/full — the in-memory counters still bound the page.
      }
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

/** Test seam: remove the page-level runtime (counters and SDK handle included). */
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

/**
 * The SDK calls this proxy builder with its upstream `/rum/v1/<org>/rum` path
 * and query; both ride along unchanged — the server relay validates the
 * sub-path and swaps the placeholder `o2-api-key` for the real token, so the
 * OpenObserve endpoint and credential never reach the browser.
 */
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
      // Explicit stop on the first granted→not-granted transition keeps the
      // view/session lifecycle unambiguous before the recovery `startView`.
      try {
        state.api.stopSession()
      } catch {
        // Swallowed: setTrackingConsent below still enforces revocation.
      }
    }
    state.api.setTrackingConsent(consent)
    if (shouldResumeView) {
      // Consent recovered while the document is still open: `startView` ends
      // the stopped view and starts a fresh one in the same document — no
      // reload/navigation, so unsaved editor input is preserved.
      try {
        state.api.startView(state.route?.id ?? 'unknown')
      } catch {
        // Swallowed: keep polling and leave consent granted.
      }
    }
  } catch {
    if (generation === state.pollGeneration && state.status === 'started' && state.api !== null) {
      // Fail closed: a missing/offline status endpoint stops collection and
      // discards the SDK's buffered events instead of continuing blind.
      const lostConsent = state.consent === 'granted'
      state.consent = 'not-granted'
      state.revokedByGate = true
      if (lostConsent) {
        try {
          state.api.stopSession()
        } catch {
          // Swallowed: setTrackingConsent below still enforces revocation.
        }
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

/**
 * Temporarily revoke consent while the O2 gate is closed, KEEPING the SDK
 * handle, route, and status poll so a later poll can resume the same document
 * with `startView` when the gate returns. Used for a bootstrap that became
 * null without an explicit privacy decision.
 */
export function suspendRum(): void {
  const state = runtime()
  const lostConsent = state.consent === 'granted'
  // Record the requested state even while `initialize` is still in flight, so
  // the just-started SDK cannot come up granted behind a closed gate.
  state.consent = 'not-granted'
  state.revokedByGate = true
  if (state.status !== 'started' || state.api === null) {
    return
  }
  if (lostConsent) {
    try {
      state.api.stopSession()
    } catch {
      // The SDK call is monitored; consent revocation still applies.
    }
  }
  state.api.setTrackingConsent('not-granted')
  // Keep the poll alive so suspend can recover when the gate returns; restart
  // it if the timer was lost.
  if (state.pollTimer === null) {
    startStatusPolling(state)
  }
}

/** Revoke consent and stop polling (DNT/GPC, invalid bootstrap, unmount/HMR). */
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

/**
 * Test seam: run one status poll immediately.
 */
export async function __pollRumStatusForTests(): Promise<void> {
  await pollStatus(runtime())
}

/**
 * Idempotently start the slim SDK. Returns once initialization settled; a
 * failure is contained and later calls never retry in the same page.
 */
export async function startRum(bootstrap: FrontendRumBootstrap, route: RumRouteContext): Promise<void> {
  const state = runtime()
  state.route = route

  if (state.status === 'failed') {
    return
  }
  if (state.status === 'started') {
    // Consent recovery is owned exclusively by the status poll: a SPA
    // navigation or stale bootstrap must never re-authorize behind a closed
    // gate — only update the view name and keep polling.
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

  // A fresh idle start is backed by an active root-loader bootstrap, so reset
  // stale not-granted state; an in-flight `starting` run keeps a suspend that
  // was requested during the import.
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
    // The one SDK import edge in the client graph; reached lazily, so the
    // package ships as its own chunk.
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
      // The SDK refuses to initialize without a token; this placeholder never
      // leaves the same-origin relay, which injects the real one server-side.
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
