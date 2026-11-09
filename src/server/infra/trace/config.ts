// Development-only OpenObserve activation (ADR-0012).
//
// This module is the single place that turns the raw `trace.*` config block
// into either an inert no-op or a fully validated server/frontend projection.
// It never imports an OTel/OpenObserve SDK: `runtime.ts` owns the real
// implementation and consumes `ServerTraceRuntimeConfig` from here.

import type { FrontendRumBootstrap } from '@/shared/contracts/trace'

import { serverConfig, type TraceConfigSection } from '@/server/infra/config'
import { getLogger } from '@/server/infra/logger'
import { verifiedFrontendBootstrap } from '@/server/infra/trace/frontend-gate'

const log = getLogger('trace')

const ORGANIZATION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/
// Header values are printable ASCII without surrounding whitespace: the
// exact OpenObserve ingestion value must never carry a CR/LF (header
// injection) or a stray space that changes the upstream credential.
const AUTHORIZATION_HEADER_PATTERN = /^[\x20-\x7E]+$/
// Application IDs and RUM client tokens are opaque printable strings; both
// reject whitespace so a pasted value cannot silently break the browser SDK.
const APPLICATION_ID_PATTERN = /^[A-Za-z0-9._:-]{1,256}$/
const CLIENT_TOKEN_PATTERN = /^[\x21-\x7E]{1,4096}$/
const MAX_AUTHORIZATION_HEADER_LENGTH = 8192

export interface ServerTraceRuntimeConfig {
  /** Normalized OpenObserve origin (`http://127.0.0.1:5080`). */
  endpoint: string
  organization: string
  /** Exact server-only OTLP authorization value. Never projected to the browser. */
  authorizationHeader: string
  sampleRate: number
  includeRedactedSql: boolean
  otlpTracesUrl: string
  otlpMetricsUrl: string
}

export interface OtlpUrls {
  traces: string
  metrics: string
}

export type TraceDiagnosticCode = 'trace-production-disabled' | 'trace-invalid-config' | 'trace-frontend-invalid-config'

export interface TraceConfigDiagnostic {
  code: TraceDiagnosticCode
  level: 'warn' | 'error'
  /** Dotted config keys only — never a configured value. */
  fields: readonly string[]
}

export type TraceConfigStatus = 'disabled' | 'active' | 'invalid'

export interface TraceConfigResolution {
  /**
   * `disabled`: no provider should be started. `active`: the server pipeline
   * (and optionally frontend RUM) is fully configured. `invalid`: tracing was
   * requested but the server configuration failed validation.
   */
  status: TraceConfigStatus
  server: ServerTraceRuntimeConfig | null
  frontend: FrontendRumBootstrap | null
  diagnostics: readonly TraceConfigDiagnostic[]
}

export interface ResolveTraceConfigOptions {
  isDevelopment: boolean
}

const DIAGNOSTIC_MESSAGES: Record<TraceDiagnosticCode, string> = {
  'trace-production-disabled': 'OpenObserve tracing is disabled in production builds (trace.enabled is ignored)',
  'trace-invalid-config': 'OpenObserve tracing is disabled because the configuration is invalid or incomplete',
  'trace-frontend-invalid-config':
    'OpenObserve frontend RUM is disabled because the configuration is invalid or incomplete',
}

/** Derive the direct OpenObserve OTLP endpoints from the validated origin. */
export function deriveOtlpUrls(origin: string, organization: string): OtlpUrls {
  const base = `${origin.replace(/\/+$/, '')}/api/${organization}`
  return {
    traces: `${base}/v1/traces`,
    metrics: `${base}/v1/metrics`,
  }
}

function isLoopbackHostname(hostname: string): boolean {
  const host = hostname.toLowerCase()
  if (host === 'localhost' || host === '[::1]' || host === '::1') {
    return true
  }
  return /^127(?:\.\d{1,3}){3}$/.test(host)
}

/**
 * Parse the configured OpenObserve origin. Rejects credentials, query
 * strings, fragments, non-root paths, non-http(s) schemes, and plain HTTP to
 * any non-loopback host.
 */
function parseTraceEndpoint(raw: string): string | null {
  if (raw.length === 0 || raw !== raw.trim()) {
    return null
  }
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return null
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return null
  }
  if (url.username !== '' || url.password !== '') {
    return null
  }
  if (url.search !== '' || url.hash !== '') {
    return null
  }
  if (url.pathname !== '/' && url.pathname !== '') {
    return null
  }
  if (url.protocol === 'http:' && !isLoopbackHostname(url.hostname)) {
    return null
  }
  return url.origin
}

function isValidAuthorizationHeader(value: string): boolean {
  return (
    value.length > 0 &&
    value.length <= MAX_AUTHORIZATION_HEADER_LENGTH &&
    AUTHORIZATION_HEADER_PATTERN.test(value) &&
    value === value.trim()
  )
}

function isRateInRange(value: number, max: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= max
}

function buildServerConfig(
  endpoint: string,
  organization: string,
  authorizationHeader: string,
  input: TraceConfigSection,
): ServerTraceRuntimeConfig {
  const urls = deriveOtlpUrls(endpoint, organization)
  return {
    endpoint,
    organization,
    authorizationHeader,
    sampleRate: input.sampleRate,
    includeRedactedSql: input.includeRedactedSql,
    otlpTracesUrl: urls.traces,
    otlpMetricsUrl: urls.metrics,
  }
}

/**
 * Resolve activation from a parsed `trace.*` block.
 *
 * Production is always inert (at most one warning), and any invalid server
 * configuration disables BOTH pipelines rather than partially initializing.
 * Frontend RUM is only offered on top of a fully active server pipeline.
 */
export function resolveTraceConfig(
  input: TraceConfigSection,
  options: ResolveTraceConfigOptions,
): TraceConfigResolution {
  if (!options.isDevelopment) {
    return {
      status: 'disabled',
      server: null,
      frontend: null,
      diagnostics: input.enabled
        ? [{ code: 'trace-production-disabled', level: 'warn', fields: ['trace.enabled'] }]
        : [],
    }
  }

  if (!input.enabled) {
    return { status: 'disabled', server: null, frontend: null, diagnostics: [] }
  }

  const serverFields: string[] = []
  const endpoint = parseTraceEndpoint(input.endpoint)
  if (endpoint === null) {
    serverFields.push('trace.endpoint')
  }
  const organization = ORGANIZATION_PATTERN.test(input.organization) ? input.organization : null
  if (organization === null) {
    serverFields.push('trace.organization')
  }
  if (!isRateInRange(input.sampleRate, 1)) {
    serverFields.push('trace.sampleRate')
  }
  const authorizationHeader = isValidAuthorizationHeader(input.serverAuthorizationHeader)
    ? input.serverAuthorizationHeader
    : null
  if (authorizationHeader === null) {
    serverFields.push('trace.serverAuthorizationHeader')
  }

  if (endpoint === null || organization === null || authorizationHeader === null || serverFields.length > 0) {
    return {
      status: 'invalid',
      server: null,
      frontend: null,
      diagnostics: [{ code: 'trace-invalid-config', level: 'error', fields: serverFields }],
    }
  }

  const server = buildServerConfig(endpoint, organization, authorizationHeader, input)

  if (!input.frontend.enabled) {
    return { status: 'active', server, frontend: null, diagnostics: [] }
  }

  const frontendFields: string[] = []
  const applicationId = APPLICATION_ID_PATTERN.test(input.frontend.applicationId) ? input.frontend.applicationId : null
  if (applicationId === null) {
    frontendFields.push('trace.frontend.applicationId')
  }
  const clientToken = CLIENT_TOKEN_PATTERN.test(input.frontend.clientToken) ? input.frontend.clientToken : null
  if (clientToken === null) {
    frontendFields.push('trace.frontend.clientToken')
  }
  if (!isRateInRange(input.frontend.sessionSampleRate, 100)) {
    frontendFields.push('trace.frontend.sessionSampleRate')
  }

  if (applicationId === null || clientToken === null || frontendFields.length > 0) {
    return {
      status: 'active',
      server,
      frontend: null,
      diagnostics: [{ code: 'trace-frontend-invalid-config', level: 'warn', fields: frontendFields }],
    }
  }

  return {
    status: 'active',
    server,
    frontend: {
      site: endpoint,
      organization,
      applicationId,
      clientToken,
      service: 'kobato',
      environment: 'development',
      sessionSampleRate: input.frontend.sessionSampleRate,
    },
    diagnostics: [],
  }
}

/** The build-time development gate. Production is never development. */
export function isTraceDevelopmentRuntime(): boolean {
  return import.meta.env.DEV === true && import.meta.env.PROD !== true
}

/** Resolve the process-wide boot snapshot (`serverConfig.trace`). */
export function currentTraceConfig(): TraceConfigResolution {
  return resolveTraceConfig(serverConfig.trace, { isDevelopment: isTraceDevelopmentRuntime() })
}

/**
 * The frontend bootstrap the root loader and CSP may expose. Pure config
 * resolution only produces a CANDIDATE; this function additionally requires
 * the DEV runtime's startup verification of the O2 allowlist pipeline.
 */
export function activeFrontendRum(): FrontendRumBootstrap | null {
  if (currentTraceConfig().frontend === null) {
    return null
  }
  return verifiedFrontendBootstrap()
}

/** Format one diagnostic without ever echoing a configured value. */
export function formatTraceDiagnostic(diagnostic: TraceConfigDiagnostic): string {
  return `${DIAGNOSTIC_MESSAGES[diagnostic.code]}: ${diagnostic.fields.join(', ')}`
}

/**
 * Emit the safe startup diagnostics. Resolutions carry at most one
 * diagnostic per affected pipeline, so an enabled-but-incomplete block
 * produces one log line containing field names only.
 */
export function logTraceDiagnostics(diagnostics: readonly TraceConfigDiagnostic[]): void {
  for (const diagnostic of diagnostics) {
    const message = formatTraceDiagnostic(diagnostic)
    if (diagnostic.level === 'warn') {
      log.warn(message)
    } else {
      log.error(message)
    }
  }
}

/** Resolve and log the boot-time trace configuration snapshot. */
export function loadTraceConfig(): TraceConfigResolution {
  const resolution = currentTraceConfig()
  logTraceDiagnostics(resolution.diagnostics)
  return resolution
}
