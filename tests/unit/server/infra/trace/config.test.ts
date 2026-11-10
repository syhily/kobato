import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { __clearLogCaptureForTests, __logCaptureForTests } from '@/server/infra/logger'
import {
  deriveOtlpUrls,
  formatTraceDiagnostic,
  logTraceDiagnostics,
  resolveTraceConfig,
  type TraceRuntimeSettings,
} from '@/server/infra/trace/config'
import { frontendRumBootstrapSchema } from '@/shared/contracts/trace'

const BASE: TraceRuntimeSettings = {
  enabled: true,
  endpoint: 'http://127.0.0.1:5080',
  organization: 'default',
  authorizationHeader: 'Basic dGVzdDp0ZXN0',
  sampleRate: 1,
  includeRedactedSql: false,
  logs: { enabled: false },
  frontend: {
    enabled: false,
    applicationId: '',
    clientToken: '',
    sessionSampleRate: 100,
    clientIdentity: 'anonymous',
  },
}

function traceInput(
  overrides: Partial<TraceRuntimeSettings> = {},
  frontend: Partial<TraceRuntimeSettings['frontend']> = {},
): TraceRuntimeSettings {
  return {
    ...BASE,
    ...overrides,
    frontend: { ...BASE.frontend, ...frontend },
  }
}

const DEV = { environment: 'development' } as const
const PROD = { environment: 'production' } as const

beforeEach(() => {
  __clearLogCaptureForTests()
})

afterEach(() => {
  vi.restoreAllMocks()
  __clearLogCaptureForTests()
})

describe('trace config — OTLP URL derivation', () => {
  it('derives the OpenObserve trace and metric endpoints from the origin and organization', () => {
    expect(deriveOtlpUrls('https://observability.example.com', 'default')).toEqual({
      traces: 'https://observability.example.com/api/default/v1/traces',
      metrics: 'https://observability.example.com/api/default/v1/metrics',
      logs: 'https://observability.example.com/api/default/v1/logs',
    })
  })

  it('normalizes trailing slashes on the origin', () => {
    expect(deriveOtlpUrls('http://127.0.0.1:5080/', 'dev').traces).toBe('http://127.0.0.1:5080/api/dev/v1/traces')
  })
})

describe('trace config — endpoint security', () => {
  it.each([
    'http://127.0.0.1:5080',
    'http://localhost:5080',
    'http://[::1]:5080',
    'https://obs.example.com',
    // The endpoint is server-only, so plain HTTP to a private network address (an internal
    // OpenObserve) is a legitimate deployment.
    'http://192.168.1.10:5080',
    'http://10.0.0.5:5080',
    'http://172.16.0.2:5080',
    'http://[fd00::1]:5080',
  ])('accepts %s', (endpoint) => {
    const resolution = resolveTraceConfig(traceInput({ endpoint }), DEV)

    expect(resolution.status).toBe('active')
    expect(resolution.server?.endpoint).toBe(new URL(endpoint).origin)
  })

  it.each([
    ['plain HTTP to a remote host', 'http://obs.example.com'],
    // A hostname is not statically classifiable as internal — even one that
    // resolves privately requires HTTPS.
    ['plain HTTP to an internal hostname', 'http://openobserve.internal:5080'],
    ['embedded credentials', 'https://user:pass@obs.example.com'],
    ['a query string', 'https://obs.example.com/?token=1'],
    ['a fragment', 'https://obs.example.com/#frag'],
    ['a non-root path', 'https://obs.example.com/some/base'],
    ['a non-http scheme', 'ftp://obs.example.com'],
    ['an empty value', ''],
    ['surrounding whitespace', ' https://obs.example.com'],
    ['an unparseable value', 'not a url'],
  ])('rejects %s and disables both pipelines', (_label, endpoint) => {
    const resolution = resolveTraceConfig(traceInput({ endpoint }), DEV)

    expect(resolution.status).toBe('invalid')
    expect(resolution.server).toBeNull()
    expect(resolution.frontend).toBeNull()
    expect(resolution.diagnostics).toHaveLength(1)
    expect(resolution.diagnostics[0]?.fields).toContain('observability.endpoint')
  })

  it.each(['../evil', 'a/b', 'with space', '.', '..', '', 'a'.repeat(65)])(
    'rejects the organization path segment %j',
    (organization) => {
      const resolution = resolveTraceConfig(traceInput({ organization }), DEV)

      expect(resolution.status).toBe('invalid')
      expect(resolution.diagnostics[0]?.fields).toContain('observability.organization')
    },
  )

  it('accepts a closed alphanumeric organization segment', () => {
    const resolution = resolveTraceConfig(traceInput({ organization: 'team-dev_01' }), DEV)

    expect(resolution.status).toBe('active')
    expect(resolution.server?.otlpTracesUrl).toBe('http://127.0.0.1:5080/api/team-dev_01/v1/traces')
  })
})

describe('trace config — sampling and credentials', () => {
  it.each([0, 0.5, 1])('accepts sampleRate %s', (sampleRate) => {
    expect(resolveTraceConfig(traceInput({ sampleRate }), DEV).status).toBe('active')
  })

  it.each([-0.1, 1.1, Number.NaN, Number.POSITIVE_INFINITY])('rejects sampleRate %s', (sampleRate) => {
    const resolution = resolveTraceConfig(traceInput({ sampleRate }), DEV)

    expect(resolution.status).toBe('invalid')
    expect(resolution.diagnostics[0]?.fields).toContain('observability.sampleRate')
  })

  it.each([0, 50, 100])('accepts sessionSampleRate %s', (sessionSampleRate) => {
    const resolution = resolveTraceConfig(
      traceInput({}, { enabled: true, applicationId: 'app', clientToken: 'token', sessionSampleRate }),
      DEV,
    )

    expect(resolution.frontend?.sessionSampleRate).toBe(sessionSampleRate)
  })

  it.each([-1, 100.1, Number.NaN])('rejects sessionSampleRate %s without disabling the server', (rate) => {
    const resolution = resolveTraceConfig(
      traceInput({}, { enabled: true, applicationId: 'app', clientToken: 'token', sessionSampleRate: rate }),
      DEV,
    )

    expect(resolution.status).toBe('active')
    expect(resolution.server).not.toBeNull()
    expect(resolution.frontend).toBeNull()
    expect(resolution.diagnostics[0]?.fields).toContain('observability.frontend.sessionSampleRate')
  })

  it.each(['', ' leading', 'trailing ', 'line\nbreak', 'tab\tseparated', 'x'.repeat(8193)])(
    'treats the authorization header %j as missing',
    (authorizationHeader) => {
      const resolution = resolveTraceConfig(traceInput({ authorizationHeader }), DEV)

      expect(resolution.status).toBe('invalid')
      expect(resolution.diagnostics[0]?.fields).toContain('observability.credentials')
    },
  )
})

describe('trace config — activation matrix', () => {
  it('is environment-agnostic: the same active projection starts in production', () => {
    const resolution = resolveTraceConfig(
      traceInput({}, { enabled: true, applicationId: 'app', clientToken: 'token' }),
      PROD,
    )

    expect(resolution.status).toBe('active')
    expect(resolution.server).not.toBeNull()
    expect(resolution.frontend?.environment).toBe('production')
  })

  it('stays disabled — and silent — while the master switch is off', () => {
    expect(
      resolveTraceConfig(
        traceInput({ enabled: false }, { enabled: true, applicationId: 'app', clientToken: 'token' }),
        DEV,
      ),
    ).toEqual({ status: 'disabled', server: null, frontend: null, frontendRelay: null, diagnostics: [] })
  })

  it('activates the server pipeline with a valid endpoint and authorization header', () => {
    const resolution = resolveTraceConfig(traceInput(), DEV)

    expect(resolution.status).toBe('active')
    expect(resolution.diagnostics).toEqual([])
    expect(resolution.server).toEqual({
      endpoint: 'http://127.0.0.1:5080',
      organization: 'default',
      authorizationHeader: 'Basic dGVzdDp0ZXN0',
      sampleRate: 1,
      includeRedactedSql: false,
      otlpTracesUrl: 'http://127.0.0.1:5080/api/default/v1/traces',
      otlpMetricsUrl: 'http://127.0.0.1:5080/api/default/v1/metrics',
      logs: null,
    })
    expect(resolution.frontend).toBeNull()
  })

  it('offers the browser bootstrap only when every frontend gate passes', () => {
    const resolution = resolveTraceConfig(
      traceInput({}, { enabled: true, applicationId: 'kobato-dev', clientToken: 'rum-token', sessionSampleRate: 25 }),
      DEV,
    )

    expect(resolution.status).toBe('active')
    expect(resolution.diagnostics).toEqual([])
    // The browser projection carries no endpoint and no token — the same-origin intake
    // relay owns both.
    expect(frontendRumBootstrapSchema.parse(resolution.frontend)).toEqual({
      applicationId: 'kobato-dev',
      service: 'kobato',
      environment: 'development',
      sessionSampleRate: 25,
      clientIdentity: 'anonymous',
    })
    expect(JSON.stringify(resolution.frontend)).not.toContain('127.0.0.1')
    expect(JSON.stringify(resolution.frontend)).not.toContain('rum-token')
  })

  it('projects the server-only relay target alongside the bootstrap', () => {
    const resolution = resolveTraceConfig(
      traceInput({}, { enabled: true, applicationId: 'kobato-dev', clientToken: 'rum-token', sessionSampleRate: 25 }),
      DEV,
    )

    expect(resolution.frontendRelay).toEqual({
      endpoint: 'http://127.0.0.1:5080',
      organization: 'default',
      clientToken: 'rum-token',
      clientIdentity: 'anonymous',
    })
  })

  it('carries the forward client-identity mode into the bootstrap and the relay', () => {
    const resolution = resolveTraceConfig(
      traceInput(
        {},
        { enabled: true, applicationId: 'kobato-dev', clientToken: 'rum-token', clientIdentity: 'forward' },
      ),
      DEV,
    )

    expect(resolution.frontend?.clientIdentity).toBe('forward')
    expect(resolution.frontendRelay?.clientIdentity).toBe('forward')
  })

  it('projects no relay when the frontend is disabled or invalid', () => {
    expect(resolveTraceConfig(traceInput(), DEV).frontendRelay).toBeNull()

    const invalid = resolveTraceConfig(traceInput({}, { enabled: true, applicationId: 'app', clientToken: '' }), DEV)
    expect(invalid.status).toBe('active')
    expect(invalid.frontend).toBeNull()
    expect(invalid.frontendRelay).toBeNull()
  })

  it.each([
    ['applicationId', { applicationId: '' }],
    ['clientToken', { clientToken: '' }],
  ])('keeps the server active but withholds RUM when %s is missing', (_label, frontend) => {
    const resolution = resolveTraceConfig(traceInput({}, { enabled: true, ...frontend }), DEV)

    expect(resolution.status).toBe('active')
    expect(resolution.server).not.toBeNull()
    expect(resolution.frontend).toBeNull()
    expect(resolution.diagnostics).toHaveLength(1)
    expect(resolution.diagnostics[0]?.code).toBe('trace-frontend-invalid-config')
  })

  it('aggregates every server-side failure into one diagnostic', () => {
    const resolution = resolveTraceConfig(
      traceInput({
        endpoint: 'http://remote.example.com',
        organization: '../bad',
        sampleRate: 2,
        authorizationHeader: '',
      }),
      DEV,
    )

    expect(resolution.status).toBe('invalid')
    expect(resolution.diagnostics).toHaveLength(1)
    expect(resolution.diagnostics[0]?.fields).toEqual([
      'observability.endpoint',
      'observability.organization',
      'observability.sampleRate',
      'observability.credentials',
    ])
  })
})

describe('trace config — log export projection', () => {
  it('warns with field names only when logs are enabled without the master switch', () => {
    const resolution = resolveTraceConfig(traceInput({ enabled: false, logs: { enabled: true } }), DEV)

    expect(resolution).toEqual({
      status: 'disabled',
      server: null,
      frontend: null,
      frontendRelay: null,
      diagnostics: [
        {
          code: 'trace-logs-require-trace',
          level: 'warn',
          fields: ['observability.logs.enabled', 'observability.enabled'],
        },
      ],
    })

    const line = formatTraceDiagnostic(resolution.diagnostics[0]!)
    expect(line).toContain('observability.logs.enabled')
    expect(line).toContain('observability.enabled')
    expect(line).not.toContain('127.0.0.1')
  })

  it('projects the logs endpoint and reuses the trace credential only when enabled', () => {
    const disabled = resolveTraceConfig(traceInput(), DEV)
    expect(disabled.server?.logs).toBeNull()

    const enabled = resolveTraceConfig(traceInput({ logs: { enabled: true } }), DEV)
    expect(enabled.status).toBe('active')
    expect(enabled.server?.logs).toEqual({
      otlpLogsUrl: 'http://127.0.0.1:5080/api/default/v1/logs',
      authorizationHeader: 'Basic dGVzdDp0ZXN0',
    })
    expect(enabled.server?.logs?.authorizationHeader).toBe(enabled.server?.authorizationHeader)
    expect(enabled.diagnostics).toEqual([])
  })

  it('drops the logs projection when the server configuration is invalid', () => {
    const resolution = resolveTraceConfig(
      traceInput({ logs: { enabled: true }, endpoint: 'https://user:pass@obs.example.com' }),
      DEV,
    )

    expect(resolution.status).toBe('invalid')
    expect(resolution.server).toBeNull()
  })
})

describe('trace config — safe projections and diagnostics', () => {
  it('never projects the server authorization header to the browser', () => {
    const secret = 'Basic c2VydmVyLXNlY3JldA=='
    const resolution = resolveTraceConfig(
      traceInput({ authorizationHeader: secret }, { enabled: true, applicationId: 'app', clientToken: 'rum-token' }),
      DEV,
    )

    expect(resolution.frontend).not.toBeNull()
    expect('serverAuthorizationHeader' in (resolution.frontend ?? {})).toBe(false)
    expect(JSON.stringify(resolution.frontend)).not.toContain(secret)
    expect(JSON.stringify(resolution.frontend)).not.toContain('authorizationHeader')
  })

  it('formats diagnostics with field names only, never configured values', () => {
    const secret = 'Basic dGhpcy1pcy1hLXNlY3JldA=='
    const resolution = resolveTraceConfig(
      traceInput({
        endpoint: 'https://user:pass@obs.example.com',
        organization: 'bad org',
        authorizationHeader: `${secret}\nX-Injected: 1`,
      }),
      DEV,
    )

    expect(resolution.diagnostics).toHaveLength(1)
    const line = formatTraceDiagnostic(resolution.diagnostics[0]!)

    expect(line).toContain('observability.endpoint')
    expect(line).toContain('observability.organization')
    expect(line).toContain('observability.credentials')
    expect(line).not.toContain(secret)
    expect(line).not.toContain('user:pass')
  })

  it('logs one safe line for an enabled-but-incomplete configuration', () => {
    const resolution = resolveTraceConfig(
      traceInput({ authorizationHeader: '', endpoint: 'https://user:pass@obs.example.com' }),
      DEV,
    )
    expect(resolution.diagnostics).toHaveLength(1)

    logTraceDiagnostics(resolution.diagnostics)

    const entries = __logCaptureForTests().filter((entry) => entry.scope === 'trace')
    expect(entries).toHaveLength(1)
    expect(entries[0]?.level).toBe('error')
    expect(entries[0]?.msg).toContain('observability.endpoint')
    expect(entries[0]?.msg).not.toContain('user:pass')
  })
})
