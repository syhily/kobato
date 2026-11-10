import { afterEach, describe, expect, it, vi } from 'vitest'

// safeFetch resolves hosts through `node:dns/promises`; keep every test on a
// public address and stub only global fetch (the safe-fetch test convention).
vi.mock('node:dns/promises', () => ({
  lookup: vi.fn(async () => [{ address: '93.184.216.34', family: 4 }]),
}))

import { createO2Client, O2ClientError } from '@/server/domains/observability/o2-client'

const BASE = 'https://obs.example.com'

afterEach(() => {
  vi.unstubAllGlobals()
})

interface Call {
  url: string
  init: RequestInit
}

function mockFetch(handler: (call: Call) => Response | Promise<Response>): Call[] {
  const calls: Call[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
      const call = { url, init: init ?? {} }
      calls.push(call)
      return handler(call)
    }),
  )
  return calls
}

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } })
}

function client(overrides: Partial<Parameters<typeof createO2Client>[0]> = {}) {
  return createO2Client({
    endpoint: BASE,
    organization: 'my-site',
    username: 'admin@example.com',
    password: 'secret',
    ...overrides,
  })
}

async function failure(promise: Promise<unknown>): Promise<O2ClientError> {
  try {
    await promise
  } catch (error) {
    expect(error).toBeInstanceOf(O2ClientError)
    return error as O2ClientError
  }
  throw new Error('expected the call to reject')
}

describe('o2-client — health and version', () => {
  it('probes healthz and reads the version from the authenticated org config', async () => {
    const calls = mockFetch((call) =>
      call.url.endsWith('/healthz') ? json({ status: 'ok' }) : json({ version: 'v1.1.2' }),
    )
    const o2 = client()
    await expect(o2.health()).resolves.toBeUndefined()
    await expect(o2.getVersion()).resolves.toBe('v1.1.2')

    expect(calls.map((call) => call.url)).toEqual([`${BASE}/healthz`, `${BASE}/api/my-site/config`])
    for (const call of calls) {
      expect((call.init.headers as Record<string, string>).authorization).toBe(
        `Basic ${Buffer.from('admin@example.com:secret').toString('base64')}`,
      )
    }
  })

  it('fails health when the endpoint answers a non-ok status body', async () => {
    mockFetch(() => json({ status: 'not ok' }))
    const error = await failure(client().health())
    expect(error).toMatchObject({ kind: 'upstream', operation: 'health' })
  })
})

describe('o2-client — failure classification', () => {
  it('classifies 401 as auth', async () => {
    mockFetch(() => json({}, 401))
    expect(await failure(client().listOrganizations())).toMatchObject({ kind: 'auth', status: 401 })
  })

  it('classifies 403 as forbidden', async () => {
    mockFetch(() => json({}, 403))
    expect(await failure(client().listOrganizations())).toMatchObject({ kind: 'forbidden', status: 403 })
  })

  it('classifies 5xx as upstream', async () => {
    mockFetch(() => json({}, 503))
    expect(await failure(client().listOrganizations())).toMatchObject({ kind: 'upstream', status: 503 })
  })

  it('classifies a transport timeout', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_input: RequestInfo | URL, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () =>
              reject(new DOMException('The operation timed out.', 'TimeoutError')),
            )
          }),
      ),
    )
    expect(await failure(client({ timeoutMs: 5 }).listOrganizations())).toMatchObject({ kind: 'timeout' })
  })

  it('classifies an unreachable network', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new TypeError('fetch failed'))),
    )
    expect(await failure(client().listOrganizations())).toMatchObject({ kind: 'network' })
  })

  it('never includes the endpoint in the error message', async () => {
    mockFetch(() => json({}, 401))
    const error = await failure(client().listOrganizations())
    expect(error.message).not.toContain('obs.example.com')
    expect(error.message).not.toContain('secret')
  })
})

describe('o2-client — idempotent GET retry', () => {
  it('retries a GET once after a transient network failure and succeeds', async () => {
    let attempts = 0
    const calls = mockFetch(() => {
      attempts += 1
      if (attempts === 1) {
        throw new TypeError('fetch failed')
      }
      return json({ data: [{ identifier: 'my-site', name: 'My Site' }] })
    })

    await expect(client().listOrganizations()).resolves.toEqual([{ identifier: 'my-site', name: 'My Site' }])
    expect(calls).toHaveLength(2)
  })

  it('gives up after one retry and reports the transient kind', async () => {
    const fetchMock = vi.fn(() => Promise.reject(new TypeError('fetch failed')))
    vi.stubGlobal('fetch', fetchMock)

    expect(await failure(client().listOrganizations())).toMatchObject({ kind: 'network' })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('does not retry a GET the upstream answered (even 5xx)', async () => {
    const calls = mockFetch(() => json({}, 503))

    await failure(client().listOrganizations())
    expect(calls).toHaveLength(1)
  })

  it('never retries a mutation', async () => {
    const fetchMock = vi.fn(() => Promise.reject(new TypeError('fetch failed')))
    vi.stubGlobal('fetch', fetchMock)

    await failure(client().createRumToken())
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

describe('o2-client — organization creation', () => {
  it('reports an existing organization without creating one', async () => {
    const calls = mockFetch(() => json({ data: [{ identifier: 'my-site', name: 'my-site' }] }))
    await expect(client().ensureOrganization()).resolves.toBe('exists')
    expect(calls.every((call) => call.url.endsWith('/api/organizations'))).toBe(true)
  })

  it('creates the organization through an ingestion write so the identifier matches the site name', async () => {
    let ingestionSeen = false
    const calls = mockFetch((call) => {
      if (call.url.endsWith('/api/organizations')) {
        return json({ data: ingestionSeen ? [{ identifier: 'my-site' }] : [] })
      }
      ingestionSeen = true
      return json({})
    })
    await expect(client().ensureOrganization()).resolves.toBe('created')
    const ingestion = calls.find((call) => call.url.endsWith('/v1/logs'))
    expect(ingestion?.init.method).toBe('POST')
    expect(ingestion?.init.body).toBe('{"resourceLogs":[]}')
  })

  it('maps a refused creation to forbidden', async () => {
    mockFetch((call) => (call.url.endsWith('/api/organizations') ? json({ data: [] }) : json({}, 404)))
    expect(await failure(client().ensureOrganization())).toMatchObject({
      kind: 'not-found',
      operation: 'ensure-organization',
    })
  })

  it('rejects an organization outside the path grammar before any request', async () => {
    const fn = vi.fn()
    vi.stubGlobal('fetch', fn)
    let thrown: unknown
    try {
      createO2Client({ endpoint: BASE, organization: '../default', username: 'u', password: 'p' })
    } catch (error) {
      thrown = error
    }
    expect(thrown).toBeInstanceOf(O2ClientError)
    expect((thrown as O2ClientError).kind).toBe('config')
    expect(fn).not.toHaveBeenCalled()
  })
})

describe('o2-client — RUM tokens', () => {
  it('treats a missing token (404) as null', async () => {
    mockFetch(() => json({}, 404))
    await expect(client().getRumToken()).resolves.toBeNull()
  })

  it('returns the stored token', async () => {
    mockFetch(() => json({ data: { rum_token: 'rum-abc' } }))
    await expect(client().getRumToken()).resolves.toBe('rum-abc')
  })

  it('creates a token with a POST', async () => {
    const calls = mockFetch(() => json({ data: { rum_token: 'rum-new' } }))
    await expect(client().createRumToken()).resolves.toBe('rum-new')
    expect(calls[0]?.init.method).toBe('POST')
    expect(calls[0]?.url).toBe(`${BASE}/api/my-site/rumtoken`)
  })
})

describe('o2-client — assets', () => {
  it('creates a missing function and updates an existing one', async () => {
    let existing = false
    const calls = mockFetch((call) => {
      if (call.url.endsWith('/functions') && (call.init.method ?? 'GET') === 'GET') {
        return json({ list: existing ? [{ name: 'fn' }] : [] })
      }
      existing = true
      return json({})
    })
    const o2 = client()
    await o2.upsertFunction({ name: 'fn', function: '.' })
    await o2.upsertFunction({ name: 'fn', function: '. = .' })
    expect(calls.map((call) => call.init.method)).toEqual(['GET', 'POST', 'GET', 'PUT'])
    expect(calls[3]?.url).toBe(`${BASE}/api/my-site/functions/fn`)
  })

  it('updates a pipeline with its current pipeline id and version', async () => {
    const calls = mockFetch((call) => {
      if (call.url.endsWith('/pipelines') && (call.init.method ?? 'GET') === 'GET') {
        return json({ list: [{ name: 'p', pipeline_id: 'pid-1' }] })
      }
      if (call.url.endsWith('/pipelines/pid-1')) {
        return json({ version: 4 })
      }
      return json({})
    })
    await client().upsertPipeline({
      name: 'p',
      description: 'd',
      enabled: true,
      source: {},
      nodes: [],
      edges: [],
    })
    expect(calls.at(-1)?.url).toBe(`${BASE}/api/my-site/pipelines`)
    expect(calls.at(-1)?.init.method).toBe('PUT')
    expect(JSON.parse(String(calls.at(-1)?.init.body))).toMatchObject({ pipeline_id: 'pid-1', version: 4 })
  })

  it('updates an existing dashboard by title and creates a missing one', async () => {
    let created = false
    const calls = mockFetch((call) => {
      if (call.url.includes('/dashboards?folder=default') && (call.init.method ?? 'GET') === 'GET') {
        return json({
          dashboards: created ? [{ hash: 'h1', v8: { dashboardId: 'dash-1', title: 'Kobato — Overview' } }] : [],
        })
      }
      if (call.url.includes('/dashboards?folder=default') && call.init.method === 'POST') {
        created = true
        return json({ v8: { dashboardId: 'dash-1' } })
      }
      return json({})
    })
    const o2 = client()
    await expect(o2.upsertDashboard({ title: 'Kobato — Overview' })).resolves.toBe('dash-1')
    await expect(o2.upsertDashboard({ title: 'Kobato — Overview' })).resolves.toBe('dash-1')
    const update = calls.find((call) => call.init.method === 'PUT')
    expect(update?.url).toBe(`${BASE}/api/my-site/dashboards/dash-1?folder=default&hash=h1`)
  })
})

describe('o2-client — streams', () => {
  it('lists streams with their current retention, skipping malformed entries', async () => {
    const calls = mockFetch(() =>
      json({
        list: [
          { name: '_rumdata', stream_type: 'logs', settings: { data_retention: 7 } },
          { name: 'default', stream_type: 'traces', settings: {} },
          { name: 'no-settings' },
          { stream_type: 'logs' },
          'garbage',
        ],
      }),
    )
    await expect(client().listStreams('logs')).resolves.toEqual([
      { name: '_rumdata', retentionDays: 7 },
      { name: 'default', retentionDays: null },
      { name: 'no-settings', retentionDays: null },
    ])
    expect(calls[0]?.url).toBe(`${BASE}/api/my-site/streams?type=logs`)
  })

  it('applies retention with a PUT to the stream settings endpoint', async () => {
    const calls = mockFetch(() => json({}))
    await expect(client().setStreamRetention('_rumdata', 'logs', 30)).resolves.toBeUndefined()
    expect(calls[0]?.url).toBe(`${BASE}/api/my-site/streams/_rumdata/settings?type=logs`)
    expect(calls[0]?.init.method).toBe('PUT')
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({ data_retention: 30 })
  })

  it('classifies a streams failure with the closed operation', async () => {
    mockFetch(() => json({}, 403))
    expect(await failure(client().listStreams('metrics'))).toMatchObject({ kind: 'forbidden', operation: 'streams' })
  })
})
