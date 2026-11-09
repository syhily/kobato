// Frontend RUM event privacy boundary (ADR-0012).
//
// Every SDK event passes through this synchronous allowlist before it can
// leave the browser. The projection builds a NEW object from validated fields;
// the caller then replaces the SDK event in place. Unknown shapes, unknown
// event types, unrecognized dynamic URLs, and any thrown error fail closed.
//
// SDK 0.4.3 limitation: `limitModification` deep-clones the event, calls
// `beforeSend` on the clone, and copies back ONLY the SDK's declared
// modifiable fields. It also ignores `false` for `view` events. Therefore:
//   - view/view_update free fields (name/url/referrer/context/service/version
//     and LCP resource_url) are overwritten with trusted values BEFORE any
//     risky work; a failed projection still sends a safe minimal view.
//   - every other event type is dropped on failure (`false`).
//   - non-modifiable SDK fields cannot be removed here; the OpenObserve ingest
//     allowlist is the second boundary.

import type { RumBeforeSend, RumEvent, RumEventDomainContext } from '@openobserve/browser-rum-slim'

import type { RumBudgetStore } from '@/client/lib/rum-budget'
import type { RumRouteContext } from '@/client/lib/rum-route'

import { createRumSessionBudget } from '@/client/lib/rum-budget'
import { sanitizeResourceUrl } from '@/client/lib/rum-url-policy'
import { unsafeCast } from '@/shared/utils/unsafe-cast'

type JsonRecord = Record<string, unknown>
type Projected = JsonRecord

export interface RumEventScope {
  /** Document origin, e.g. `http://localhost:4321`. */
  origin: string
  route: RumRouteContext
}

export interface RumEventPolicyOptions {
  getScope: () => RumEventScope | null
  maxResourcesPerSession?: number
  maxErrorsPerSession?: number
  budgetStore?: RumBudgetStore
  /** Trusted values for the SDK's modifiable `service`/`version` fields. */
  service?: string
  version?: string
}

const ROUTE_ID_PATTERN = /^[A-Za-z0-9_./:-]{1,160}$/
const ROUTE_TEMPLATE_PATTERN = /^\/[A-Za-z0-9_\-./:*]{0,511}$/
const APPLICATION_ID_PATTERN = /^[A-Za-z0-9._:-]{1,256}$/
const SESSION_ID_PATTERN = /^[A-Za-z0-9-]{8,64}$/
const TRACE_ID_PATTERN = /^[0-9a-f]{32}$/
const SPAN_ID_PATTERN = /^[0-9a-f]{16}$/
const TAG_KEY_PATTERN = /^(?:sdk_version|env|service|version)$/
const TAG_VALUE_PATTERN = /^[A-Za-z0-9_.:/-]{1,64}$/
const ERROR_CODE_PATTERN = /^[A-Za-z][A-Za-z0-9_]{0,63}$/
const ERROR_TYPE_PATTERN = /^[A-Za-z][A-Za-z0-9_]{0,63}$/
const MAX_STACK_FRAMES = 20
const MAX_STACK_LENGTH = 2048
const MAX_TAGS = 8

const SAFE_ERROR_TYPES: ReadonlySet<string> = new Set([
  'Error',
  'TypeError',
  'RangeError',
  'SyntaxError',
  'ReferenceError',
  'EvalError',
  'URIError',
  'AggregateError',
  'AbortError',
  'TimeoutError',
  'ORPCError',
  'HTTPException',
  'DomainError',
])

const ERROR_SOURCES: ReadonlySet<string> = new Set([
  'network',
  'source',
  'console',
  'logger',
  'agent',
  'webview',
  'custom',
  'report',
])
const ERROR_HANDLING: ReadonlySet<string> = new Set(['handled', 'unhandled'])
const SESSION_TYPES: ReadonlySet<string> = new Set(['user', 'synthetics', 'ci_test'])
const ERROR_CATEGORIES: ReadonlySet<string> = new Set([
  'ANR',
  'App Hang',
  'Exception',
  'Watchdog Termination',
  'Memory Warning',
  'Network',
])
const RESOURCE_TYPES: ReadonlySet<string> = new Set([
  'document',
  'xhr',
  'beacon',
  'fetch',
  'css',
  'js',
  'image',
  'font',
  'media',
  'other',
  'native',
])
const HTTP_METHODS: ReadonlySet<string> = new Set([
  'POST',
  'GET',
  'HEAD',
  'PUT',
  'DELETE',
  'PATCH',
  'TRACE',
  'OPTIONS',
  'CONNECT',
])
const VIEW_LOADING_TYPES: ReadonlySet<string> = new Set([
  'initial_load',
  'route_change',
  'activity_display',
  'activity_redisplay',
  'fragment_display',
  'fragment_redisplay',
  'view_controller_display',
  'view_controller_redisplay',
  'session_renewal',
  'bf_cache',
])
const DELIVERY_TYPES: ReadonlySet<string> = new Set(['cache', 'navigational-prefetch', 'other'])
const RENDER_BLOCKING: ReadonlySet<string> = new Set(['blocking', 'non-blocking'])
const SESSION_PRECONDITIONS: ReadonlySet<string> = new Set([
  'user_app_launch',
  'inactivity_timeout',
  'max_duration',
  'background_launch',
  'prewarm',
  'from_non_interactive_session',
  'explicit_stop',
])

const VIEW_NUMERIC_KEYS = [
  'time_spent',
  'loading_time',
  'network_settled_time',
  'interaction_to_next_view_time',
  'dom_complete',
  'dom_content_loaded',
  'dom_interactive',
  'load_event',
  'first_byte',
] as const
const VIEW_COUNT_KEYS = ['action', 'error', 'crash', 'long_task', 'resource', 'frozen_frame'] as const

/** Event types this policy can project; everything else is dropped. */
const ALLOWED_EVENT_TYPES: ReadonlySet<string> = new Set(['view', 'view_update', 'resource', 'error', 'long_task'])

const SIZE_BUCKETS = [0, 1024, 4096, 16384, 65536, 262144, 1048576, 4194304, 16777216, 67108864] as const
const FRAME_PATH_PATTERN = /^\/(?:src|assets|@vite|node_modules\/\.vite)\/[A-Za-z0-9_\-./@%]{1,300}$/

function isSafeOrigin(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 256) {
    return false
  }
  try {
    const url = new URL(value)
    return (
      (url.protocol === 'http:' || url.protocol === 'https:') &&
      url.username === '' &&
      url.password === '' &&
      (url.pathname === '/' || url.pathname === '') &&
      url.search === '' &&
      url.hash === ''
    )
  } catch {
    return false
  }
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function recordField(value: unknown, key: string): JsonRecord | null {
  if (!isRecord(value)) {
    return null
  }
  const field = value[key]
  return isRecord(field) ? field : null
}

function stringField(value: unknown, key: string): string | null {
  if (!isRecord(value)) {
    return null
  }
  const field = value[key]
  return typeof field === 'string' ? field : null
}

function numberField(value: unknown, key: string): number | null {
  if (!isRecord(value)) {
    return null
  }
  const field = value[key]
  return typeof field === 'number' && Number.isFinite(field) && field >= 0 ? field : null
}

function closedString(value: unknown, allowed: ReadonlySet<string>): string | undefined {
  return typeof value === 'string' && allowed.has(value) ? value : undefined
}

function optionalString(value: unknown, pattern: RegExp): string | undefined {
  return typeof value === 'string' && pattern.test(value) ? value : undefined
}

function coarseBytes(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return undefined
  }
  for (const bucket of SIZE_BUCKETS) {
    if (value <= bucket) {
      return bucket
    }
  }
  return SIZE_BUCKETS[SIZE_BUCKETS.length - 1]
}

function projectO2Tags(raw: unknown): string | undefined {
  if (typeof raw !== 'string' || raw.length === 0) {
    return undefined
  }
  const tags: string[] = []
  for (const entry of raw.split(',')) {
    if (tags.length >= MAX_TAGS) {
      break
    }
    const separator = entry.indexOf(':')
    if (separator <= 0) {
      continue
    }
    const key = entry.slice(0, separator)
    const value = entry.slice(separator + 1)
    if (TAG_KEY_PATTERN.test(key) && TAG_VALUE_PATTERN.test(value)) {
      tags.push(`${key}:${value}`)
    }
  }
  return tags.length > 0 ? tags.join(',') : undefined
}

function projectTraceFields(raw: JsonRecord | null): Projected | undefined {
  if (raw === null) {
    return undefined
  }
  const projected: Projected = {}
  for (const key of ['trace_id', 'span_id', 'parent_span_id'] as const) {
    const value = raw[key]
    if (typeof value === 'string' && (key === 'trace_id' ? TRACE_ID_PATTERN : SPAN_ID_PATTERN).test(value)) {
      projected[key] = value
    }
  }
  const rulePsr = numberField(raw, 'rule_psr')
  if (rulePsr !== null && rulePsr <= 100) {
    projected.rule_psr = rulePsr
  }
  return Object.keys(projected).length > 0 ? projected : undefined
}

function projectO2(raw: JsonRecord | null, allowTrace: boolean): Projected | undefined {
  if (raw === null) {
    return undefined
  }
  const projected: Projected = {}
  if (raw.format_version === 2) {
    projected.format_version = 2
  }
  const browserSdkVersion = optionalString(raw.browser_sdk_version, /^\d+\.\d+\.\d+(?:-[A-Za-z0-9.]+)?$/)
  if (browserSdkVersion !== undefined) {
    projected.browser_sdk_version = browserSdkVersion
  }
  const sdkName = optionalString(raw.sdk_name, /^[a-z-]{1,16}$/)
  if (sdkName !== undefined) {
    projected.sdk_name = sdkName
  }

  const session = recordField(raw, 'session')
  if (session !== null) {
    const projectedSession: Projected = {}
    if (session.plan === 1 || session.plan === 2) {
      projectedSession.plan = session.plan
    }
    const precondition = closedString(session.session_precondition, SESSION_PRECONDITIONS)
    if (precondition !== undefined) {
      projectedSession.session_precondition = precondition
    }
    if (Object.keys(projectedSession).length > 0) {
      projected.session = projectedSession
    }
  }

  const configuration = recordField(raw, 'configuration')
  if (configuration !== null) {
    const projectedConfiguration: Projected = {}
    for (const key of [
      'session_sample_rate',
      'session_replay_sample_rate',
      'profiling_sample_rate',
      'trace_sample_rate',
    ] as const) {
      const value = numberField(configuration, key)
      if (value !== null && value <= 100) {
        projectedConfiguration[key] = value
      }
    }
    if (Object.keys(projectedConfiguration).length > 0) {
      projected.configuration = projectedConfiguration
    }
  }

  if (allowTrace) {
    const trace = projectTraceFields(raw)
    if (trace !== undefined) {
      Object.assign(projected, trace)
    }
  }
  return Object.keys(projected).length > 0 ? projected : undefined
}

function sanitizeStack(raw: unknown): string | undefined {
  if (typeof raw !== 'string' || raw.length === 0) {
    return undefined
  }
  const frames: string[] = []
  let total = 0
  for (const line of raw.split('\n')) {
    if (frames.length >= MAX_STACK_FRAMES) {
      break
    }
    const location = /(?:^|\()((?:https?:\/\/[^\s()]+?)?\/[^\s()]+):(\d{1,7}):(\d{1,7})\)?\s*$/.exec(line.trim())
    if (location === null) {
      continue
    }
    const path = location[1]!.replace(/^https?:\/\/[^/]+/, '')
    if (!FRAME_PATH_PATTERN.test(path) || path.includes('..')) {
      continue
    }
    const frame = `at ${path}:${location[2]}:${location[3]}`
    if (total + frame.length > MAX_STACK_LENGTH) {
      break
    }
    frames.push(frame)
    total += frame.length + 1
  }
  return frames.length > 0 ? frames.join('\n') : undefined
}

function projectPerformance(raw: unknown): Projected | undefined {
  const performance = isRecord(raw) ? raw : null
  if (performance === null) {
    return undefined
  }
  const projected: Projected = {}

  const cls = recordField(performance, 'cls')
  if (cls !== null) {
    const score = numberField(cls, 'score')
    if (score !== null) {
      const entry: Projected = { score }
      const timestamp = numberField(cls, 'timestamp')
      if (timestamp !== null) {
        entry.timestamp = timestamp
      }
      projected.cls = entry
    }
  }

  for (const key of ['fcp', 'fbc'] as const) {
    const entry = recordField(performance, key)
    const timestamp = entry === null ? null : numberField(entry, 'timestamp')
    if (timestamp !== null) {
      projected[key] = { timestamp }
    }
  }

  const fid = recordField(performance, 'fid')
  if (fid !== null) {
    const duration = numberField(fid, 'duration')
    const timestamp = numberField(fid, 'timestamp')
    if (duration !== null) {
      projected.fid = { duration, ...(timestamp === null ? {} : { timestamp }) }
    }
  }

  const inp = recordField(performance, 'inp')
  if (inp !== null) {
    const duration = numberField(inp, 'duration')
    if (duration !== null) {
      const entry: Projected = { duration }
      const timestamp = numberField(inp, 'timestamp')
      if (timestamp !== null) {
        entry.timestamp = timestamp
      }
      const subParts = recordField(inp, 'sub_parts')
      if (subParts !== null) {
        const projectedSubParts: Projected = {}
        for (const subKey of ['input_delay', 'processing_duration', 'presentation_delay'] as const) {
          const value = numberField(subParts, subKey)
          if (value !== null) {
            projectedSubParts[subKey] = value
          }
        }
        if (Object.keys(projectedSubParts).length > 0) {
          entry.sub_parts = projectedSubParts
        }
      }
      projected.inp = entry
    }
  }

  const lcp = recordField(performance, 'lcp')
  if (lcp !== null) {
    // The path must exist in the clone even when the timestamp is missing:
    // otherwise `limitModification` cannot reach (and clear) the original
    // `resource_url`.
    const entry: Projected = { resource_url: '' }
    const timestamp = numberField(lcp, 'timestamp')
    if (timestamp !== null) {
      entry.timestamp = timestamp
    }
    const subParts = recordField(lcp, 'sub_parts')
    if (subParts !== null) {
      const projectedSubParts: Projected = {}
      for (const subKey of ['load_delay', 'load_time', 'render_delay'] as const) {
        const value = numberField(subParts, subKey)
        if (value !== null) {
          projectedSubParts[subKey] = value
        }
      }
      if (Object.keys(projectedSubParts).length > 0) {
        entry.sub_parts = projectedSubParts
      }
    }
    projected.lcp = entry
  }

  return Object.keys(projected).length > 0 ? projected : undefined
}

function projectViewDetails(raw: unknown): Projected | undefined {
  const view = isRecord(raw) ? raw : null
  if (view === null) {
    return undefined
  }
  const projected: Projected = {}
  for (const key of VIEW_NUMERIC_KEYS) {
    const value = numberField(view, key)
    if (value !== null) {
      projected[key] = value
    }
  }
  for (const key of VIEW_COUNT_KEYS) {
    const count = recordField(view, key)
    const value = count === null ? null : numberField(count, 'count')
    if (value !== null) {
      projected[key] = { count: Math.trunc(value) }
    }
  }
  const loadingType = closedString(view.loading_type, VIEW_LOADING_TYPES)
  if (loadingType !== undefined) {
    projected.loading_type = loadingType
  }
  if (typeof view.is_active === 'boolean') {
    projected.is_active = view.is_active
  }
  if (typeof view.is_slow_rendered === 'boolean') {
    projected.is_slow_rendered = view.is_slow_rendered
  }
  const performance = projectPerformance(view.performance)
  if (performance !== undefined) {
    projected.performance = performance
  }
  return Object.keys(projected).length > 0 ? projected : undefined
}

function projectResourceDetails(raw: unknown, scope: RumEventScope): Projected | null {
  const resource = isRecord(raw) ? raw : null
  if (resource === null) {
    return null
  }
  const type = closedString(resource.type, RESOURCE_TYPES)
  const url = sanitizeResourceUrl(resource.url, scope.origin)
  if (type === undefined || url === null) {
    return null
  }
  const projected: Projected = { type, url }
  const method = closedString(resource.method, HTTP_METHODS)
  if (method !== undefined) {
    projected.method = method
  }
  const statusCode = numberField(resource, 'status_code')
  if (statusCode !== null && Number.isInteger(statusCode) && statusCode >= 100 && statusCode <= 599) {
    projected.status_code = statusCode
  }
  const duration = numberField(resource, 'duration')
  if (duration !== null) {
    projected.duration = duration
  }
  for (const key of ['size', 'transfer_size'] as const) {
    const bucket = coarseBytes(resource[key])
    if (bucket !== undefined) {
      projected[key] = bucket
    }
  }
  for (const phase of ['worker', 'redirect', 'dns', 'connect', 'ssl', 'first_byte', 'download'] as const) {
    const entry = recordField(resource, phase)
    if (entry === null) {
      continue
    }
    const projectedPhase: Projected = {}
    for (const key of ['duration', 'start'] as const) {
      const value = numberField(entry, key)
      if (value !== null) {
        projectedPhase[key] = value
      }
    }
    if (Object.keys(projectedPhase).length > 0) {
      projected[phase] = projectedPhase
    }
  }
  const renderBlocking = closedString(resource.render_blocking_status, RENDER_BLOCKING)
  if (renderBlocking !== undefined) {
    projected.render_blocking_status = renderBlocking
  }
  const deliveryType = closedString(resource.delivery_type, DELIVERY_TYPES)
  if (deliveryType !== undefined) {
    projected.delivery_type = deliveryType
  }
  const protocol = optionalString(resource.protocol, /^[A-Za-z0-9./-]{1,16}$/)
  if (protocol !== undefined) {
    projected.protocol = protocol
  }
  // `limitModification` can only reach declared paths. Keep empty objects on
  // the clone so the SDK clears request/response headers, and clear the
  // GraphQL variables free-form string.
  if (isRecord(resource.request)) {
    projected.request = {}
  }
  if (isRecord(resource.response)) {
    projected.response = {}
  }
  if (isRecord(resource.graphql)) {
    projected.graphql = { variables: '' }
  }
  return projected
}

function projectErrorDetails(raw: unknown, scope: RumEventScope, codeHint: string | null): Projected | null {
  const error = isRecord(raw) ? raw : null
  if (error === null) {
    return null
  }
  const source = closedString(error.source, ERROR_SOURCES)
  if (source === undefined) {
    return null
  }
  const rawType = optionalString(error.type, ERROR_TYPE_PATTERN)
  const projected: Projected = {
    type: rawType !== undefined && SAFE_ERROR_TYPES.has(rawType) ? rawType : 'Error',
    source,
    // The free-form SDK message can carry slugs, titles, SQL, and response
    // bodies. Only a fixed category leaves the browser.
    message: `${source}_error`,
  }
  const handling = closedString(error.handling, ERROR_HANDLING)
  if (handling !== undefined) {
    projected.handling = handling
  }
  const category = closedString(error.category, ERROR_CATEGORIES)
  if (category !== undefined) {
    projected.category = category
  }

  const resource = recordField(error, 'resource')
  let statusCode: number | null = null
  if (resource !== null) {
    const projectedResource: Projected = {}
    const method = closedString(resource.method, HTTP_METHODS)
    if (method !== undefined) {
      projectedResource.method = method
    }
    const status = numberField(resource, 'status_code')
    if (status !== null && Number.isInteger(status) && status >= 100 && status <= 599) {
      projectedResource.status_code = status
      statusCode = status
    }
    // Always overwrite the URL: `limitModification` copies only a string
    // value back, so leaving it undefined would preserve the raw URL.
    projectedResource.url = sanitizeResourceUrl(resource.url, scope.origin) ?? ''
    if (Object.keys(projectedResource).length > 0) {
      projected.resource = projectedResource
    }
  }

  const stack = sanitizeStack(error.stack)
  // Always overwrite the raw stack: the SDK's `limitModification` copies only
  // declared field paths, so leaving it undefined would keep the original
  // string (whose first line is the free-form error message). An empty string
  // is copied and removes the message from the wire.
  projected.stack = stack ?? ''
  projected.handling_stack = ''
  projected.fingerprint = ''

  const code = codeHint ?? (statusCode === null ? null : `http_${statusCode}`)
  if (code !== null && ERROR_CODE_PATTERN.test(code)) {
    projected.code = code
  }
  return projected
}

function projectLongTaskDetails(raw: unknown): Projected | null {
  const longTask = isRecord(raw) ? raw : null
  if (longTask === null) {
    return null
  }
  const duration = numberField(longTask, 'duration')
  if (duration === null) {
    return null
  }
  const projected: Projected = { duration }
  const blocking = numberField(longTask, 'blocking_duration')
  if (blocking !== null) {
    projected.blocking_duration = blocking
  }
  const entryType = longTask.entry_type
  if (entryType === 'long-task' || entryType === 'long-animation-frame') {
    projected.entry_type = entryType
  }
  if (typeof longTask.is_frozen_frame === 'boolean') {
    projected.is_frozen_frame = longTask.is_frozen_frame
  }
  // The SDK copies only source_url/invoker inside each script entry. Keep a
  // same-length placeholder array so both are cleared; other script fields are
  // non-modifiable and belong to the O2 allowlist.
  if (Array.isArray(longTask.scripts)) {
    projected.scripts = longTask.scripts.map(() => ({ source_url: '', invoker: '' }))
  }
  return projected
}

function projectCommon(event: JsonRecord, type: string, scope: RumEventScope, allowTrace: boolean): Projected | null {
  const application = recordField(event, 'application')
  const session = recordField(event, 'session')
  const view = recordField(event, 'view')
  const date = numberField(event, 'date')
  const applicationId = stringField(application, 'id')
  const sessionId = stringField(session, 'id')
  const viewId = stringField(view, 'id')
  const viewUrl = stringField(view, 'url')
  const sessionType = closedString(session?.type, SESSION_TYPES)
  if (
    date === null ||
    applicationId === null ||
    !APPLICATION_ID_PATTERN.test(applicationId) ||
    sessionId === null ||
    !SESSION_ID_PATTERN.test(sessionId) ||
    viewId === null ||
    !SESSION_ID_PATTERN.test(viewId) ||
    viewUrl === null ||
    viewUrl.length === 0
  ) {
    return null
  }

  const outputSession: Projected = { id: sessionId }
  if (sessionType !== undefined) {
    outputSession.type = sessionType
  }
  const projected: Projected = {
    type,
    date,
    application: { id: applicationId },
    session: outputSession,
    view: {
      id: viewId,
      name: scope.route.id,
      url: `${scope.origin}${scope.route.template}`,
      // `view.referrer` is modifiable; an empty string clears the original.
      referrer: '',
    },
  }

  // Modifiable strings must be a string in the clone, otherwise the SDK leaves
  // the original value untouched. When the event carries the field, emit a
  // safe string (possibly empty).
  if ('service' in event) {
    projected.service = optionalString(event.service, TAG_VALUE_PATTERN) ?? ''
  }
  if ('version' in event) {
    projected.version = optionalString(event.version, TAG_VALUE_PATTERN) ?? ''
  }
  const tags = projectO2Tags(event.o2tags)
  if (tags !== undefined) {
    projected.o2tags = tags
  }
  if (event.source === 'browser') {
    projected.source = 'browser'
  }

  const o2 = projectO2(recordField(event, '_o2'), allowTrace)
  if (o2 !== undefined) {
    projected._o2 = o2
  }
  return projected
}

/**
 * Pure projection: returns a fresh allowlisted event object, or `null` when
 * the event must be dropped. Never returns the input object.
 */
export function projectRumEvent(event: unknown, scope: RumEventScope, codeHint: string | null = null): RumEvent | null {
  if (!isRecord(event) || !isSafeOrigin(scope.origin)) {
    return null
  }
  if (
    !ROUTE_ID_PATTERN.test(scope.route.id) ||
    scope.route.id.includes('..') ||
    !ROUTE_TEMPLATE_PATTERN.test(scope.route.template) ||
    scope.route.template.includes('..')
  ) {
    return null
  }
  const type = typeof event.type === 'string' ? event.type : null
  if (type === null || !ALLOWED_EVENT_TYPES.has(type)) {
    return null
  }

  // Normalize the trusted origin once (a trailing slash or host casing must
  // never produce `//` in the emitted URL).
  const normalizedScope: RumEventScope = { origin: new URL(scope.origin).origin, route: scope.route }
  const common = projectCommon(event, type, normalizedScope, type === 'resource' || type === 'error')
  if (common === null) {
    return null
  }

  if (type === 'view' || type === 'view_update') {
    const view = projectViewDetails(event.view)
    if (view === undefined) {
      return null
    }
    common.view = { ...(isRecord(common.view) ? common.view : {}), ...view }
    return toRumEvent(common)
  }

  if (type === 'resource') {
    const resource = projectResourceDetails(event.resource, normalizedScope)
    if (resource === null) {
      return null
    }
    common.resource = resource
    return toRumEvent(common)
  }

  if (type === 'error') {
    const error = projectErrorDetails(event.error, normalizedScope, codeHint)
    if (error === null) {
      return null
    }
    common.error = error
    return toRumEvent(common)
  }

  const longTask = projectLongTaskDetails(event.long_task)
  if (longTask === null) {
    return null
  }
  common.long_task = longTask
  return toRumEvent(common)
}

/**
 * Single cast point: the projected object is structurally a RUM event after
 * the allowlist above, but the SDK's readonly union cannot be built piecewise.
 */
function toRumEvent(value: Projected): RumEvent {
  return unsafeCast<RumEvent>(value)
}

function readSessionId(event: unknown): string | null {
  const id = stringField(recordField(event, 'session'), 'id')
  return id !== null && SESSION_ID_PATTERN.test(id) ? id : null
}

function readEventType(event: unknown): string | null {
  return isRecord(event) && typeof event.type === 'string' ? event.type : null
}

function stableCodeFromContext(context: RumEventDomainContext | undefined): string | null {
  if (context === undefined || !isRecord(context)) {
    return null
  }
  const error = context.error
  if (error === null || (typeof error !== 'object' && typeof error !== 'function')) {
    return null
  }
  const code = Reflect.get(error, 'code') as unknown
  return typeof code === 'string' && ERROR_CODE_PATTERN.test(code) ? code : null
}

function replaceEventInPlace(target: RumEvent, projected: RumEvent): boolean {
  const record: JsonRecord = target
  for (const key of Object.keys(record)) {
    delete record[key]
  }
  Object.assign(record, projected)
  return true
}

interface TrustedViewTarget {
  name: string
  url: string
}

const UNKNOWN_VIEW_TARGET: TrustedViewTarget = { name: 'unknown', url: '/unknown' }

/**
 * Resolve the only trusted view identity available to `beforeSend`. Any scope
 * failure (missing, hostile, invalid) collapses to the fixed safe fallback.
 */
function trustedViewTarget(getScope: () => RumEventScope | null): TrustedViewTarget {
  try {
    const scope = getScope()
    if (scope === null || !isSafeOrigin(scope.origin)) {
      return UNKNOWN_VIEW_TARGET
    }
    const route = scope.route
    if (
      !ROUTE_ID_PATTERN.test(route.id) ||
      route.id.includes('..') ||
      !ROUTE_TEMPLATE_PATTERN.test(route.template) ||
      route.template.includes('..')
    ) {
      return UNKNOWN_VIEW_TARGET
    }
    return { name: route.id, url: `${new URL(scope.origin).origin}${route.template}` }
  } catch {
    return UNKNOWN_VIEW_TARGET
  }
}

function safeSet(record: JsonRecord, key: string, value: unknown): void {
  try {
    Reflect.set(record, key, value)
  } catch {
    // Frozen/hostile object: the remaining best-effort writes still run.
  }
}

function safeGet(value: unknown, key: string): unknown {
  if (value === null || (typeof value !== 'object' && typeof value !== 'function')) {
    return undefined
  }
  try {
    return Reflect.get(value, key)
  } catch {
    return undefined
  }
}

function readRecordOrNull(value: unknown): JsonRecord | null {
  try {
    return isRecord(value) ? value : null
  } catch {
    return null
  }
}

/**
 * Overwrite every SDK-declared modifiable free field before any operation
 * that can throw. This is the only view guarantee: SDK 0.4.3 ignores
 * `beforeSend`'s `false` for views, so a later projection failure must still
 * leave safe URL/name/referrer/context values on the clone for copy-back.
 */
function sanitizeModifiableFields(event: unknown, options: RumEventPolicyOptions): void {
  if (!isRecord(event)) {
    return
  }
  const target = trustedViewTarget(options.getScope)

  let view = readRecordOrNull(safeGet(event, 'view'))
  if (view === null) {
    safeSet(event, 'view', { name: target.name, url: target.url, referrer: '' })
    view = readRecordOrNull(safeGet(event, 'view'))
  }
  if (view !== null) {
    safeSet(view, 'name', target.name)
    safeSet(view, 'url', target.url)
    safeSet(view, 'referrer', '')
    try {
      const performance = readRecordOrNull(safeGet(view, 'performance'))
      const lcp = performance === null ? null : readRecordOrNull(safeGet(performance, 'lcp'))
      if (lcp !== null) {
        safeSet(lcp, 'resource_url', '')
      } else if (performance !== null) {
        safeSet(performance, 'lcp', { resource_url: '' })
      } else {
        safeSet(view, 'performance', { lcp: { resource_url: '' } })
      }
    } catch {
      safeSet(view, 'performance', { lcp: { resource_url: '' } })
    }
  }

  safeSet(event, 'context', {})
  if (options.service !== undefined) {
    safeSet(event, 'service', TAG_VALUE_PATTERN.test(options.service) ? options.service : '')
  }
  if (options.version !== undefined) {
    safeSet(event, 'version', TAG_VALUE_PATTERN.test(options.version) ? options.version : '')
  }
}

export interface RumEventPolicy {
  beforeSend: RumBeforeSend
  reset: () => void
}

/**
 * Build the SDK `beforeSend` policy. Counters are per browser session (the SDK
 * session id); an id change resets them. Excess resource/error events are
 * dropped, never queued.
 */
export function createRumEventPolicy(options: RumEventPolicyOptions): RumEventPolicy {
  const budget = createRumSessionBudget({
    maxResourcesPerSession: options.maxResourcesPerSession,
    maxErrorsPerSession: options.maxErrorsPerSession,
    budgetStore: options.budgetStore,
  })

  const beforeSend: RumBeforeSend = (event, context) => {
    // FIRST: overwrite the SDK's modifiable free fields. For views this is the
    // only guarantee, because the SDK ignores `false` and still sends them.
    sanitizeModifiableFields(event, options)

    let type: string | null = null
    try {
      type = readEventType(event)
    } catch {
      return false
    }
    // A view cannot be dropped by beforeSend; everything else can.
    const viewFallback = type === 'view'

    try {
      const scope = options.getScope()
      if (scope === null) {
        return viewFallback
      }
      const eventSession = readSessionId(event)
      if (eventSession === null || type === null) {
        return viewFallback
      }
      if (!budget.canAccept(eventSession, type)) {
        return false
      }
      const projected = projectRumEvent(event, scope, stableCodeFromContext(context))
      if (projected === null) {
        return viewFallback
      }
      replaceEventInPlace(event, projected)
      budget.commit(eventSession, type)
      return true
    } catch {
      // Unknown shapes, hostile getters, and sanitizer bugs fail closed for
      // droppable events. Views keep the safe fields written above.
      return viewFallback
    }
  }

  return { beforeSend, reset: budget.reset }
}
