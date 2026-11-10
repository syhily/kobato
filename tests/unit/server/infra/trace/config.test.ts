import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { loadServerConfig, type TraceConfigSection } from '@/server/infra/config'
import { __clearLogCaptureForTests, __logCaptureForTests } from '@/server/infra/logger'
import {
  currentTraceConfig,
  deriveOtlpUrls,
  formatTraceDiagnostic,
  loadTraceConfig,
  logTraceDiagnostics,
  resolveTraceConfig,
} from '@/server/infra/trace/config'
import { frontendRumBootstrapSchema } from '@/shared/contracts/trace'

const realArgv = process.argv

const TRACE_ENV_KEYS = [
  'trace__enabled',
  'trace__logs__enabled',
  'trace__endpoint',
  'trace__organization',
  'trace__serverAuthorizationHeader',
  'trace__sampleRate',
  'trace__includeRedactedSql',
  'trace__frontend__enabled',
  'trace__frontend__applicationId',
  'trace__frontend__clientToken',
  'trace__frontend__sessionSampleRate',
] as const

const BASE: TraceConfigSection = {
  enabled: true,
  logs: { enabled: false },
  endpoint: 'http://127.0.0.1:5080',
  organization: 'default',
  serverAuthorizationHeader: 'Basic dGVzdDp0ZXN0',
  sampleRate: 1,
  includeRedactedSql: false,
  frontend: {
    enabled: false,
    applicationId: '',
    clientToken: '',
    sessionSampleRate: 100,
  },
}

function traceInput(
  overrides: Partial<TraceConfigSection> = {},
  frontend: Partial<TraceConfigSection['frontend']> = {},
): TraceConfigSection {
  return {
    ...BASE,
    ...overrides,
    frontend: { ...BASE.frontend, ...frontend },
  }
}

const DEV = { isDevelopment: true }
const PROD = { isDevelopment: false }

function clearTraceEnv(): void {
  for (const key of TRACE_ENV_KEYS) {
    vi.stubEnv(key, undefined)
  }
}

beforeEach(() => {
  clearTraceEnv()
  __clearLogCaptureForTests()
})

afterEach(() => {
  process.argv = realArgv
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  __clearLogCaptureForTests()
})

describe('trace config — CONFIG_TABLE defaults and env coercion', () => {
  it('defaults the entire trace block to an inert, disabled configuration', () => {
    process.argv = [realArgv[0]!, realArgv[1]!]

    expect(loadServerConfig().trace).toEqual({
      enabled: false,
      logs: { enabled: false },
      endpoint: '',
      organization: 'default',
      serverAuthorizationHeader: '',
      sampleRate: 1,
      includeRedactedSql: false,
      frontend: {
        enabled: false,
        applicationId: '',
        clientToken: '',
        sessionSampleRate: 100,
      },
    })
  })

  it('coerces the __-convention env values to native booleans and numbers', () => {
    process.argv = [realArgv[0]!, realArgv[1]!]
    vi.stubEnv('trace__enabled', 'true')
    vi.stubEnv('trace__endpoint', 'https://observability.example.com')
    vi.stubEnv('trace__organization', 'team-prod')
    vi.stubEnv('trace__serverAuthorizationHeader', 'Basic abc123')
    vi.stubEnv('trace__sampleRate', '0.25')
    vi.stubEnv('trace__includeRedactedSql', 'false')
    vi.stubEnv('trace__frontend__enabled', 'true')
    vi.stubEnv('trace__frontend__applicationId', 'kobato-dev')
    vi.stubEnv('trace__frontend__clientToken', 'rum-token-123')
    vi.stubEnv('trace__frontend__sessionSampleRate', '12.5')

    const trace = loadServerConfig().trace

    expect(trace.enabled).toBe(true)
    expect(trace.endpoint).toBe('https://observability.example.com')
    expect(trace.organization).toBe('team-prod')
    expect(trace.serverAuthorizationHeader).toBe('Basic abc123')
    expect(trace.sampleRate).toBe(0.25)
    expect(trace.includeRedactedSql).toBe(false)
    expect(trace.frontend).toEqual({
      enabled: true,
      applicationId: 'kobato-dev',
      clientToken: 'rum-token-123',
      sessionSampleRate: 12.5,
    })
  })

  it('accepts 1/0 boolean env spellings without treating "false" as truthy', () => {
    process.argv = [realArgv[0]!, realArgv[1]!]
    vi.stubEnv('trace__enabled', '1')
    vi.stubEnv('trace__includeRedactedSql', '0')
    vi.stubEnv('trace__frontend__enabled', '0')

    const trace = loadServerConfig().trace

    expect(trace.enabled).toBe(true)
    expect(trace.includeRedactedSql).toBe(false)
    expect(trace.frontend.enabled).toBe(false)
  })

  it('keeps a numeric-looking authorization value as a string', () => {
    process.argv = [realArgv[0]!, realArgv[1]!]
    const secret = '1234567890123456789012345678901234567890'
    vi.stubEnv('trace__serverAuthorizationHeader', secret)

    expect(loadServerConfig().trace.serverAuthorizationHeader).toBe(secret)
  })
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
  it.each(['http://127.0.0.1:5080', 'http://localhost:5080', 'http://[::1]:5080', 'https://obs.example.com'])(
    'accepts %s',
    (endpoint) => {
      const resolution = resolveTraceConfig(traceInput({ endpoint }), DEV)

      expect(resolution.status).toBe('active')
      expect(resolution.server?.endpoint).toBe(new URL(endpoint).origin)
    },
  )

  it.each([
    ['plain HTTP to a remote host', 'http://obs.example.com'],
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
    expect(resolution.diagnostics[0]?.fields).toContain('trace.endpoint')
  })

  it.each(['../evil', 'a/b', 'with space', '.', '..', '', 'a'.repeat(65)])(
    'rejects the organization path segment %j',
    (organization) => {
      const resolution = resolveTraceConfig(traceInput({ organization }), DEV)

      expect(resolution.status).toBe('invalid')
      expect(resolution.diagnostics[0]?.fields).toContain('trace.organization')
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
    expect(resolution.diagnostics[0]?.fields).toContain('trace.sampleRate')
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
    expect(resolution.diagnostics[0]?.fields).toContain('trace.frontend.sessionSampleRate')
  })

  it.each(['', ' leading', 'trailing ', 'line\nbreak', 'tab\tseparated', 'x'.repeat(8193)])(
    'treats the authorization header %j as missing',
    (serverAuthorizationHeader) => {
      const resolution = resolveTraceConfig(traceInput({ serverAuthorizationHeader }), DEV)

      expect(resolution.status).toBe('invalid')
      expect(resolution.diagnostics[0]?.fields).toContain('trace.serverAuthorizationHeader')
    },
  )
})

describe('trace config — activation matrix', () => {
  it('is inert in production even with a complete configuration', () => {
    const resolution = resolveTraceConfig(
      traceInput({}, { enabled: true, applicationId: 'app', clientToken: 'token' }),
      PROD,
    )

    expect(resolution.status).toBe('disabled')
    expect(resolution.server).toBeNull()
    expect(resolution.frontend).toBeNull()
    expect(resolution.diagnostics).toEqual([
      { code: 'trace-production-disabled', level: 'warn', fields: ['trace.enabled'] },
    ])
  })

  it('stays silent in production when tracing is disabled', () => {
    expect(resolveTraceConfig(traceInput({ enabled: false }), PROD)).toEqual({
      status: 'disabled',
      server: null,
      frontend: null,
      diagnostics: [],
    })
  })

  it('is a no-op in development while trace.enabled is false', () => {
    expect(
      resolveTraceConfig(
        traceInput({ enabled: false }, { enabled: true, applicationId: 'app', clientToken: 'token' }),
        DEV,
      ),
    ).toEqual({ status: 'disabled', server: null, frontend: null, diagnostics: [] })
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
    expect(frontendRumBootstrapSchema.parse(resolution.frontend)).toEqual({
      site: 'http://127.0.0.1:5080',
      organization: 'default',
      applicationId: 'kobato-dev',
      clientToken: 'rum-token',
      service: 'kobato',
      environment: 'development',
      sessionSampleRate: 25,
    })
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
        serverAuthorizationHeader: '',
      }),
      DEV,
    )

    expect(resolution.status).toBe('invalid')
    expect(resolution.diagnostics).toHaveLength(1)
    expect(resolution.diagnostics[0]?.fields).toEqual([
      'trace.endpoint',
      'trace.organization',
      'trace.sampleRate',
      'trace.serverAuthorizationHeader',
    ])
  })
})

describe('trace config — log export projection', () => {
  it('defaults trace.logs.enabled to false', () => {
    process.argv = [realArgv[0]!, realArgv[1]!]

    expect(loadServerConfig().trace.logs).toEqual({ enabled: false })
  })

  it('warns with field names only when logs are enabled without trace.enabled', () => {
    const resolution = resolveTraceConfig(traceInput({ enabled: false, logs: { enabled: true } }), DEV)

    expect(resolution).toEqual({
      status: 'disabled',
      server: null,
      frontend: null,
      diagnostics: [
        {
          code: 'trace-logs-require-trace',
          level: 'warn',
          fields: ['trace.logs.enabled', 'trace.enabled'],
        },
      ],
    })

    const line = formatTraceDiagnostic(resolution.diagnostics[0]!)
    expect(line).toContain('trace.logs.enabled')
    expect(line).toContain('trace.enabled')
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

  it('stays inert in production with logs enabled', () => {
    const resolution = resolveTraceConfig(traceInput({ logs: { enabled: true } }), PROD)

    expect(resolution.status).toBe('disabled')
    expect(resolution.server).toBeNull()
    expect(resolution.frontend).toBeNull()
    expect(resolution.diagnostics).toEqual([
      { code: 'trace-production-disabled', level: 'warn', fields: ['trace.enabled'] },
    ])
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
      traceInput(
        { serverAuthorizationHeader: secret },
        { enabled: true, applicationId: 'app', clientToken: 'rum-token' },
      ),
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
        serverAuthorizationHeader: `${secret}\nX-Injected: 1`,
      }),
      DEV,
    )

    expect(resolution.diagnostics).toHaveLength(1)
    const line = formatTraceDiagnostic(resolution.diagnostics[0]!)

    expect(line).toContain('trace.endpoint')
    expect(line).toContain('trace.organization')
    expect(line).toContain('trace.serverAuthorizationHeader')
    expect(line).not.toContain(secret)
    expect(line).not.toContain('user:pass')
  })

  it('logs one safe line for an enabled-but-incomplete configuration', () => {
    const resolution = resolveTraceConfig(
      traceInput({ serverAuthorizationHeader: '', endpoint: 'https://user:pass@obs.example.com' }),
      DEV,
    )
    expect(resolution.diagnostics).toHaveLength(1)

    logTraceDiagnostics(resolution.diagnostics)

    const entries = __logCaptureForTests().filter((entry) => entry.scope === 'trace')
    expect(entries).toHaveLength(1)
    expect(entries[0]?.level).toBe('error')
    expect(entries[0]?.msg).toContain('trace.endpoint')
    expect(entries[0]?.msg).not.toContain('user:pass')
  })
})

describe('trace config — process snapshot', () => {
  it('resolves the boot snapshot to a disabled no-op in the test environment', () => {
    const resolution = currentTraceConfig()

    expect(resolution.status).toBe('disabled')
    expect(resolution.server).toBeNull()
    expect(resolution.frontend).toBeNull()
    expect(resolution.diagnostics).toEqual([])
  })

  it('does not log anything when the snapshot is disabled', () => {
    loadTraceConfig()

    expect(__logCaptureForTests().filter((entry) => entry.scope === 'trace')).toEqual([])
  })

  it('produces the production warning for the same enabled flag', () => {
    const resolution = resolveTraceConfig(traceInput({ enabled: true }), PROD)

    logTraceDiagnostics(resolution.diagnostics)

    const entries = __logCaptureForTests().filter((entry) => entry.scope === 'trace')
    expect(entries).toHaveLength(1)
    expect(entries[0]?.level).toBe('warn')
    expect(entries[0]?.msg).toContain('production')
  })
})
