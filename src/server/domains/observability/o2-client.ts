// OpenObserve management client: health, organization discovery/creation, RUM
// tokens, functions, pipelines, and v8 dashboards. Every request goes through
// `safeFetch` with the configured endpoint as a `trustedOrigin` (self-hosted O2
// may be loopback/private), has a bounded timeout, and never carries a URL or
// credential into an error. Idempotent GETs retry once after a short backoff
// on transient `network`/`timeout` failures; mutations never retry.
//
// OpenObserve v1.x `/healthz` answers only `{"status":"ok"}`; the release
// version comes from the authenticated `GET /api/<org>/config` response
// (`version`), so it is probed after the organization exists and the credentials
// are proven.

import type { SafeFetchFailure, SafeFetchResult } from '@/server/infra/safe-fetch'

import { basicAuthorizationHeader } from '@/server/domains/observability/config'
import { safeFetch } from '@/server/infra/safe-fetch'
import { OBSERVABILITY_ORGANIZATION_PATTERN, normalizeObservabilityOrigin } from '@/shared/config/observability'
import { isRecord } from '@/shared/utils/type-guards'

export const O2_REQUEST_TIMEOUT_MS = 8_000
export const O2_HEALTH_TIMEOUT_MS = 5_000
const O2_MAX_RESPONSE_BYTES = 4 * 1024 * 1024

/**
 * Idempotent GETs retry exactly once after a short backoff: a transient
 * network/timeout blip should not force the admin to re-run the connection
 * test or provisioning by hand. Only `network`/`timeout` kinds qualify — an
 * answered HTTP status (even 5xx) is an upstream decision, not a blip.
 * Mutations are never retried.
 */
const O2_GET_RETRY_BACKOFF_MS = 250

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

export type O2Operation =
  | 'health'
  | 'organizations'
  | 'ensure-organization'
  | 'version'
  | 'rum-token'
  | 'functions'
  | 'pipelines'
  | 'dashboards'
  | 'streams'

export type O2ErrorKind =
  | 'config'
  | 'network'
  | 'timeout'
  | 'auth'
  | 'forbidden'
  | 'not-found'
  | 'upstream'
  | 'invalid-response'

/** Safe failure surface: a closed kind + the operation + the upstream status. Never a URL or a credential. */
export class O2ClientError extends Error {
  readonly kind: O2ErrorKind
  readonly operation: O2Operation
  readonly status: number | null

  constructor(kind: O2ErrorKind, operation: O2Operation, status: number | null = null) {
    super(`OpenObserve ${operation} failed (${kind}${status === null ? '' : `, HTTP ${status}`})`)
    this.name = 'O2ClientError'
    this.kind = kind
    this.operation = operation
    this.status = status
  }
}

export interface O2ClientConfig {
  endpoint: string
  organization: string
  username: string
  password: string
  timeoutMs?: number
}

export interface O2Organization {
  identifier: string
  name: string
}

export interface O2FunctionRecord {
  name: string
  function: string
  transType?: number
}

export interface O2PipelineRecord {
  name: string
  description: string
  enabled: boolean
  source: Record<string, unknown>
  nodes: unknown[]
  edges: unknown[]
}

export interface O2DashboardSummary {
  dashboardId: string
  title: string
  hash?: string
}

export type O2StreamType = 'logs' | 'traces' | 'metrics'

export interface O2StreamInfo {
  name: string
  /** `settings.data_retention` in days; `null` when the upstream omits it. */
  retentionDays: number | null
}

export interface O2Client {
  health(): Promise<void>
  listOrganizations(): Promise<O2Organization[]>
  ensureOrganization(): Promise<'created' | 'exists'>
  getVersion(): Promise<string | null>
  getRumToken(): Promise<string | null>
  createRumToken(): Promise<string>
  upsertFunction(transform: O2FunctionRecord): Promise<void>
  upsertPipeline(pipeline: O2PipelineRecord): Promise<string>
  listDashboards(): Promise<O2DashboardSummary[]>
  upsertDashboard(body: Record<string, unknown>): Promise<string>
  listStreams(type: O2StreamType): Promise<O2StreamInfo[]>
  setStreamRetention(stream: string, type: O2StreamType, days: number): Promise<void>
}

interface ParsedJson {
  value: unknown
}

function decodeBody(body: ArrayBuffer): string {
  return new TextDecoder().decode(body)
}

function parseJson(result: Extract<SafeFetchResult, { ok: true }>, operation: O2Operation): ParsedJson {
  const text = decodeBody(result.body)
  if (text.trim() === '') {
    return { value: null }
  }
  try {
    return { value: JSON.parse(text) as unknown }
  } catch {
    throw new O2ClientError('invalid-response', operation, result.response.status)
  }
}

function failureKind(result: SafeFetchFailure): O2ErrorKind {
  if (result.reason === 'http-error') {
    const status = result.status ?? 0
    if (status === 401) {
      return 'auth'
    }
    if (status === 403) {
      return 'forbidden'
    }
    if (status === 404) {
      return 'not-found'
    }
    if (status === 408 || status === 504) {
      return 'timeout'
    }
    return 'upstream'
  }
  switch (result.reason) {
    case 'invalid-url':
    case 'bad-protocol':
    case 'bad-port':
    case 'blocked-host':
      return 'config'
    case 'dns-failure':
    case 'fetch-failed':
      return 'network'
    case 'timeout':
      return 'timeout'
    case 'too-large':
      return 'invalid-response'
    case 'too-many-redirects':
    case 'missing-redirect-location':
    case 'redirect-vetoed':
      return 'upstream'
  }
}

function recordList(value: unknown, key: string): Record<string, unknown>[] {
  if (!isRecord(value) || !Array.isArray(value[key])) {
    return []
  }
  return (value[key] as unknown[]).filter(isRecord)
}

function titleOf(body: Record<string, unknown>): string {
  return typeof body.title === 'string' ? body.title : ''
}

/**
 * Build a client from the saved settings section. Configuration/grammar
 * problems throw `config` before any request; the organization is re-asserted
 * against the shared grammar before it is interpolated into a path.
 */
export function createO2Client(config: O2ClientConfig): O2Client {
  const origin = normalizeObservabilityOrigin(config.endpoint)
  if (origin === null) {
    throw new O2ClientError('config', 'health')
  }
  if (!OBSERVABILITY_ORGANIZATION_PATTERN.test(config.organization)) {
    throw new O2ClientError('config', 'organizations')
  }
  // `organizations` is a reserved global API segment in O2; an org with that
  // identifier can never be addressed through `/api/<org>/...`.
  if (config.organization.toLowerCase() === 'organizations') {
    throw new O2ClientError('config', 'organizations')
  }
  const authorization = basicAuthorizationHeader(config.username, config.password)
  if (authorization === null) {
    throw new O2ClientError('config', 'health')
  }
  const baseOrigin: string = origin
  const authHeader: string = authorization
  const timeoutMs = config.timeoutMs ?? O2_REQUEST_TIMEOUT_MS
  const orgSegment = encodeURIComponent(config.organization)
  const orgBase = `/api/${orgSegment}`

  async function call(
    path: string,
    operation: O2Operation,
    init: { method?: string; body?: string } = {},
  ): Promise<Extract<SafeFetchResult, { ok: true }>> {
    const headers: Record<string, string> = {
      authorization: authHeader,
      accept: 'application/json',
    }
    if (init.body !== undefined) {
      headers['content-type'] = 'application/json'
    }
    const method = init.method ?? 'GET'
    const attempts = method === 'GET' ? 2 : 1
    for (let attempt = 1; ; attempt += 1) {
      const result = await safeFetch(`${baseOrigin}${path}`, {
        method,
        headers,
        body: init.body,
        timeoutMs: operation === 'health' ? O2_HEALTH_TIMEOUT_MS : timeoutMs,
        maxBytes: O2_MAX_RESPONSE_BYTES,
        maxRedirects: 0,
        trustedOrigin: baseOrigin,
        operation: 'observability.o2',
      })
      if (result.ok) {
        return result
      }
      const kind = failureKind(result)
      const retryable = attempt < attempts && (kind === 'network' || kind === 'timeout')
      if (!retryable) {
        throw new O2ClientError(kind, operation, result.status)
      }
      await sleep(O2_GET_RETRY_BACKOFF_MS)
    }
  }

  async function requestJson(
    path: string,
    operation: O2Operation,
    init?: { method?: string; body?: string },
  ): Promise<unknown> {
    const result = await call(path, operation, init)
    return parseJson(result, operation).value
  }

  function requireOrganization(value: unknown, organization: string): 'created' | 'exists' | null {
    if (!isRecord(value) || !Array.isArray(value.data)) {
      return null
    }
    const entries = (value.data as unknown[]).filter(isRecord)
    for (const entry of entries) {
      if (entry.identifier === organization) {
        return 'exists'
      }
    }
    return null
  }

  async function listDashboardsRequest(): Promise<O2DashboardSummary[]> {
    const value = await requestJson(`${orgBase}/dashboards?folder=default`, 'dashboards')
    if (!isRecord(value) || !Array.isArray(value.dashboards)) {
      return []
    }
    return (value.dashboards as unknown[]).flatMap((entry) => {
      if (!isRecord(entry) || !isRecord(entry.v8)) {
        return []
      }
      const v8 = entry.v8
      if (typeof v8.dashboardId !== 'string' || typeof v8.title !== 'string') {
        return []
      }
      return [
        {
          dashboardId: v8.dashboardId,
          title: v8.title,
          ...(typeof entry.hash === 'string' ? { hash: entry.hash } : {}),
        },
      ]
    })
  }

  return {
    async health(): Promise<void> {
      const value = await requestJson('/healthz', 'health')
      if (!isRecord(value) || value.status !== 'ok') {
        throw new O2ClientError('upstream', 'health')
      }
    },

    async listOrganizations(): Promise<O2Organization[]> {
      const value = await requestJson('/api/organizations', 'organizations')
      if (!isRecord(value) || !Array.isArray(value.data)) {
        return []
      }
      return (value.data as unknown[]).flatMap((entry) => {
        if (!isRecord(entry) || typeof entry.identifier !== 'string') {
          return []
        }
        return [{ identifier: entry.identifier, name: typeof entry.name === 'string' ? entry.name : '' }]
      })
    },

    async ensureOrganization(): Promise<'created' | 'exists'> {
      const found = requireOrganization(await requestJson('/api/organizations', 'organizations'), config.organization)
      if (found === 'exists') {
        return 'exists'
      }
      // O2 v1.x `POST /organizations` assigns a generated identifier, which
      // cannot equal the site-name organization the runtime addresses. The
      // documented identifier-preserving path is root-user auto-provisioning
      // through an ingestion write: the path segment becomes the identifier.
      await call(`${orgBase}/v1/logs`, 'ensure-organization', {
        method: 'POST',
        body: JSON.stringify({ resourceLogs: [] }),
      })
      const after = requireOrganization(await requestJson('/api/organizations', 'organizations'), config.organization)
      if (after === null) {
        throw new O2ClientError('forbidden', 'ensure-organization')
      }
      return 'created'
    },

    async getVersion(): Promise<string | null> {
      const value = await requestJson(`${orgBase}/config`, 'version')
      return isRecord(value) && typeof value.version === 'string' ? value.version : null
    },

    async getRumToken(): Promise<string | null> {
      try {
        const result = await call(`${orgBase}/rumtoken`, 'rum-token')
        const value = parseJson(result, 'rum-token').value
        if (!isRecord(value) || !isRecord(value.data)) {
          return null
        }
        const token = value.data.rum_token
        return typeof token === 'string' && token !== '' ? token : null
      } catch (error) {
        // No token yet is a normal 404, not a failure.
        if (error instanceof O2ClientError && error.kind === 'not-found') {
          return null
        }
        throw error
      }
    },

    async createRumToken(): Promise<string> {
      const value = await requestJson(`${orgBase}/rumtoken`, 'rum-token', {
        method: 'POST',
        body: '{}',
      })
      const token = isRecord(value) && isRecord(value.data) ? value.data.rum_token : undefined
      if (typeof token !== 'string' || token === '') {
        throw new O2ClientError('invalid-response', 'rum-token')
      }
      return token
    },

    async upsertFunction(transform: O2FunctionRecord): Promise<void> {
      const list = await requestJson(`${orgBase}/functions`, 'functions')
      const exists = recordList(list, 'list').some((entry) => entry.name === transform.name)
      const body = JSON.stringify({ ...transform, transType: transform.transType ?? 0 })
      if (exists) {
        await call(`${orgBase}/functions/${encodeURIComponent(transform.name)}`, 'functions', {
          method: 'PUT',
          body,
        })
        return
      }
      await call(`${orgBase}/functions`, 'functions', { method: 'POST', body })
    },

    async upsertPipeline(pipeline: O2PipelineRecord): Promise<string> {
      const list = await requestJson(`${orgBase}/pipelines`, 'pipelines')
      const existing = recordList(list, 'list').find((entry) => entry.name === pipeline.name)
      const pipelineId = existing?.pipeline_id
      if (typeof pipelineId === 'string' && pipelineId !== '') {
        const current = await requestJson(`${orgBase}/pipelines/${encodeURIComponent(pipelineId)}`, 'pipelines')
        const version = isRecord(current) && typeof current.version === 'number' ? current.version : 0
        await call(`${orgBase}/pipelines`, 'pipelines', {
          method: 'PUT',
          body: JSON.stringify({ ...pipeline, pipeline_id: pipelineId, version }),
        })
        return pipelineId
      }
      const created = await requestJson(`${orgBase}/pipelines`, 'pipelines', {
        method: 'POST',
        body: JSON.stringify(pipeline),
      })
      const id = isRecord(created) && typeof created.id === 'string' ? created.id : ''
      if (id === '') {
        throw new O2ClientError('invalid-response', 'pipelines')
      }
      return id
    },

    async listDashboards(): Promise<O2DashboardSummary[]> {
      return listDashboardsRequest()
    },

    async upsertDashboard(body: Record<string, unknown>): Promise<string> {
      const title = titleOf(body)
      const dashboards = await listDashboardsRequest()
      const existing = dashboards.find((dashboard) => dashboard.title === title)
      if (existing === undefined) {
        const created = await requestJson(`${orgBase}/dashboards?folder=default`, 'dashboards', {
          method: 'POST',
          body: JSON.stringify(body),
        })
        const id = isRecord(created) && isRecord(created.v8) ? created.v8.dashboardId : undefined
        return typeof id === 'string' ? id : 'created'
      }
      const params = new URLSearchParams({ folder: 'default' })
      if (existing.hash !== undefined) {
        params.set('hash', existing.hash)
      }
      await call(
        `${orgBase}/dashboards/${encodeURIComponent(existing.dashboardId)}?${params.toString()}`,
        'dashboards',
        {
          method: 'PUT',
          body: JSON.stringify({ ...body, dashboardId: existing.dashboardId }),
        },
      )
      return existing.dashboardId
    },

    async listStreams(type: O2StreamType): Promise<O2StreamInfo[]> {
      const value = await requestJson(`${orgBase}/streams?type=${type}`, 'streams')
      return recordList(value, 'list').flatMap((entry) => {
        if (typeof entry.name !== 'string' || entry.name === '') {
          return []
        }
        const settings = isRecord(entry.settings) ? entry.settings : null
        const retention =
          settings !== null && typeof settings.data_retention === 'number' ? settings.data_retention : null
        return [{ name: entry.name, retentionDays: retention }]
      })
    },

    async setStreamRetention(stream: string, type: O2StreamType, days: number): Promise<void> {
      await call(`${orgBase}/streams/${encodeURIComponent(stream)}/settings?type=${type}`, 'streams', {
        method: 'PUT',
        body: JSON.stringify({ data_retention: days }),
      })
    },
  }
}
