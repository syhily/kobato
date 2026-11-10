// OpenObserve activation (ADR-0012, now a released product capability).
//
// This module is the single place that turns a settings projection (the
// `observability` section, mapped by `domains/observability`) into either an
// inert no-op or a fully validated server/frontend projection. It never imports
// an OTel/OpenObserve SDK: `runtime.ts` owns the real implementation and
// consumes `ServerTraceRuntimeConfig` from here.

import type { FrontendRumBootstrap } from '@/shared/contracts/trace'

import { getLogger } from '@/server/infra/logger'
import { verifiedFrontendBootstrap } from '@/server/infra/trace/frontend-gate'
import {
  isSecureObservabilityOrigin,
  normalizeObservabilityOrigin,
  OBSERVABILITY_ORGANIZATION_PATTERN,
} from '@/shared/config/observability'

const log = getLogger('trace')

// Header values are printable ASCII without surrounding whitespace: the
// exact OpenObserve ingestion value must never carry a CR/LF (header
// injection) or a stray space that changes the upstream credential.
const AUTHORIZATION_HEADER_PATTERN = /^[\x20-\x7E]+$/
// Application IDs and RUM client tokens are opaque printable strings; both
// reject whitespace so a pasted value cannot silently break the browser SDK.
const APPLICATION_ID_PATTERN = /^[A-Za-z0-9._:-]{1,256}$/
const CLIENT_TOKEN_PATTERN = /^[\x21-\x7E]{1,4096}$/
const MAX_AUTHORIZATION_HEADER_LENGTH = 8192

export interface TraceLogsRuntimeConfig {
  /** Direct OTLP/HTTP logs endpoint (`<origin>/api/<org>/v1/logs`). */
  otlpLogsUrl: string
  /** The same server-only OTLP authorization value used by traces/metrics. */
  authorizationHeader: string
}

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
  /**
   * Non-null only when the pipeline is active AND the logs switch is on.
   * Logs reuse the traces/metrics endpoint, organization, and credential.
   */
  logs: TraceLogsRuntimeConfig | null
}

export interface OtlpUrls {
  traces: string
  metrics: string
  logs: string
}

export type TraceDiagnosticCode = 'trace-invalid-config' | 'trace-frontend-invalid-config' | 'trace-logs-require-trace'

export interface TraceConfigDiagnostic {
  code: TraceDiagnosticCode
  level: 'warn' | 'error'
  /** Settings keys only — never a configured value. */
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

export interface TraceFrontendSettings {
  enabled: boolean
  /** The site name (`observability.organization`), used as the O2 application id. */
  applicationId: string
  /** `observability.rumClientToken`. */
  clientToken: string
  sessionSampleRate: number
}

/**
 * The runtime input, equivalent to the `observability` settings section. The
 * domain layer composes `authorizationHeader` from the admin username/password
 * so this module stays free of credential semantics.
 */
export interface TraceRuntimeSettings {
  enabled: boolean
  endpoint: string
  organization: string
  authorizationHeader: string
  sampleRate: number
  includeRedactedSql: boolean
  logs: { enabled: boolean }
  frontend: TraceFrontendSettings
}

export interface ResolveTraceConfigOptions {
  /** Build-time environment; only projects the browser bootstrap label. */
  environment: TraceEnvironment
}

export type TraceEnvironment = 'development' | 'production'

const DIAGNOSTIC_MESSAGES: Record<TraceDiagnosticCode, string> = {
  'trace-invalid-config': 'OpenObserve tracing is disabled because the configuration is invalid or incomplete',
  'trace-frontend-invalid-config':
    'OpenObserve frontend RUM is disabled because the configuration is invalid or incomplete',
  'trace-logs-require-trace':
    'OpenObserve log export is disabled because it requires tracing (observability.logs.enabled is ignored)',
}

/** Derive the direct OpenObserve OTLP endpoints from the validated origin. */
export function deriveOtlpUrls(origin: string, organization: string): OtlpUrls {
  const base = `${origin.replace(/\/+$/, '')}/api/${organization}`
  return {
    traces: `${base}/v1/traces`,
    metrics: `${base}/v1/metrics`,
    logs: `${base}/v1/logs`,
  }
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
  input: TraceRuntimeSettings,
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
    logs: input.logs.enabled ? { otlpLogsUrl: urls.logs, authorizationHeader } : null,
  }
}

/**
 * Resolve activation from a settings projection.
 *
 * Any invalid server configuration disables BOTH pipelines rather than
 * partially initializing; frontend RUM is only offered on top of a fully
 * active server pipeline. Whether the browser gate is exposed is the runtime
 * verification's decision in `activeFrontendRum()`, not this function's, and
 * it is environment-independent.
 */
export function resolveTraceConfig(
  input: TraceRuntimeSettings,
  options: ResolveTraceConfigOptions,
): TraceConfigResolution {
  if (!input.enabled) {
    return {
      status: 'disabled',
      server: null,
      frontend: null,
      diagnostics: input.logs.enabled
        ? [
            {
              code: 'trace-logs-require-trace',
              level: 'warn',
              fields: ['observability.logs.enabled', 'observability.enabled'],
            },
          ]
        : [],
    }
  }

  const serverFields: string[] = []
  const endpoint = normalizeObservabilityOrigin(input.endpoint)
  if (endpoint === null || !isSecureObservabilityOrigin(input.endpoint)) {
    serverFields.push('observability.endpoint')
  }
  const organization = OBSERVABILITY_ORGANIZATION_PATTERN.test(input.organization) ? input.organization : null
  if (organization === null) {
    serverFields.push('observability.organization')
  }
  if (!isRateInRange(input.sampleRate, 1)) {
    serverFields.push('observability.sampleRate')
  }
  const authorizationHeader = isValidAuthorizationHeader(input.authorizationHeader) ? input.authorizationHeader : null
  if (authorizationHeader === null) {
    serverFields.push('observability.credentials')
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
    frontendFields.push('observability.organization')
  }
  const clientToken = CLIENT_TOKEN_PATTERN.test(input.frontend.clientToken) ? input.frontend.clientToken : null
  if (clientToken === null) {
    frontendFields.push('observability.rumClientToken')
  }
  if (!isRateInRange(input.frontend.sessionSampleRate, 100)) {
    frontendFields.push('observability.frontend.sessionSampleRate')
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
      environment: options.environment,
      sessionSampleRate: input.frontend.sessionSampleRate,
    },
    diagnostics: [],
  }
}

/**
 * The build-time environment LABEL projected into the browser bootstrap. It
 * never gates a pipeline: a development and a production build run the exact
 * same verification and exposure path, only the `env` dimension of the RUM
 * event differs.
 */
export function traceEnvironment(): TraceEnvironment {
  return import.meta.env.DEV === true && import.meta.env.PROD !== true ? 'development' : 'production'
}

/**
 * The frontend bootstrap the root loader and CSP may expose. The settings
 * projection only produces a CANDIDATE; this function additionally requires
 * the runtime's successful verification of the O2 allowlist pipeline (the
 * startup probe plus the periodic recheck), in EVERY build. An unverified,
 * offline, or stopped pipeline withholds only browser RUM — server
 * traces/metrics/logs keep running.
 */
export function activeFrontendRum(): FrontendRumBootstrap | null {
  return verifiedFrontendBootstrap()
}

/** Format one diagnostic without ever echoing a configured value. */
export function formatTraceDiagnostic(diagnostic: TraceConfigDiagnostic): string {
  return `${DIAGNOSTIC_MESSAGES[diagnostic.code]}: ${diagnostic.fields.join(', ')}`
}

/**
 * Emit the safe activation diagnostics. Resolutions carry at most one
 * diagnostic per affected pipeline, so an enabled-but-incomplete projection
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
