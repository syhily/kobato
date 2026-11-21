import type { RumClientIdentity } from '@kobato/settings/sections/observability'
import type { FrontendRumBootstrap } from '@kobato/settings/telemetry/rum'

import { getLogger } from '@kobato/server/infra/logger'
import {
  isSecureObservabilityOrigin,
  normalizeObservabilityOrigin,
  OBSERVABILITY_ORGANIZATION_PATTERN,
} from '@kobato/server/infra/observability'
import { verifiedFrontendBootstrap, verifiedFrontendRelay } from '@kobato/server/infra/trace/frontend-gate'

const log = getLogger('trace')

const AUTHORIZATION_HEADER_PATTERN = /^[\x20-\x7E]+$/
const APPLICATION_ID_PATTERN = /^[A-Za-z0-9._:-]{1,256}$/
const CLIENT_TOKEN_PATTERN = /^[\x21-\x7E]{1,4096}$/
const MAX_AUTHORIZATION_HEADER_LENGTH = 8192

export interface FrontendRumRelay {
  endpoint: string
  organization: string
  clientToken: string
  clientIdentity: RumClientIdentity
}

export interface TraceLogsRuntimeConfig {
  otlpLogsUrl: string
  authorizationHeader: string
}

export interface ServerTraceRuntimeConfig {
  endpoint: string
  organization: string
  authorizationHeader: string
  sampleRate: number
  includeRedactedSql: boolean
  otlpTracesUrl: string
  otlpMetricsUrl: string
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
  fields: readonly string[]
}

export type TraceConfigStatus = 'disabled' | 'active' | 'invalid'

export interface TraceConfigResolution {
  status: TraceConfigStatus
  server: ServerTraceRuntimeConfig | null
  frontend: FrontendRumBootstrap | null
  frontendRelay: FrontendRumRelay | null
  diagnostics: readonly TraceConfigDiagnostic[]
}

export interface TraceFrontendSettings {
  enabled: boolean
  applicationId: string
  clientToken: string
  sessionSampleRate: number
  clientIdentity: RumClientIdentity
}

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

export function resolveTraceConfig(
  input: TraceRuntimeSettings,
  options: ResolveTraceConfigOptions,
): TraceConfigResolution {
  if (!input.enabled) {
    return {
      status: 'disabled',
      server: null,
      frontend: null,
      frontendRelay: null,
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
      frontendRelay: null,
      diagnostics: [{ code: 'trace-invalid-config', level: 'error', fields: serverFields }],
    }
  }

  const server = buildServerConfig(endpoint, organization, authorizationHeader, input)

  if (!input.frontend.enabled) {
    return { status: 'active', server, frontend: null, frontendRelay: null, diagnostics: [] }
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
      frontendRelay: null,
      diagnostics: [{ code: 'trace-frontend-invalid-config', level: 'warn', fields: frontendFields }],
    }
  }

  return {
    status: 'active',
    server,
    frontend: {
      applicationId,
      service: 'kobato',
      environment: options.environment,
      sessionSampleRate: input.frontend.sessionSampleRate,
      clientIdentity: input.frontend.clientIdentity,
    },
    frontendRelay: { endpoint, organization, clientToken, clientIdentity: input.frontend.clientIdentity },
    diagnostics: [],
  }
}

export function traceEnvironment(): TraceEnvironment {
  return import.meta.env.DEV === true && import.meta.env.PROD !== true ? 'development' : 'production'
}

export function activeFrontendRum(): FrontendRumBootstrap | null {
  return verifiedFrontendBootstrap()
}

export function activeFrontendRelay(): FrontendRumRelay | null {
  return verifiedFrontendRelay()
}

export function formatTraceDiagnostic(diagnostic: TraceConfigDiagnostic): string {
  return `${DIAGNOSTIC_MESSAGES[diagnostic.code]}: ${diagnostic.fields.join(', ')}`
}

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
