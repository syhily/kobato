// Shared plumbing for the development-only OpenObserve setup (ADR-0012).
//
// Everything here is explicit tooling: `pnpm dev`, `pnpm test`, and the
// production build never import this module and never require Docker. The
// scripts own a single loopback container, a dedicated volume, and a state
// file in the worktree's ignored `tmp/openobserve/` tree (mode 0600) so no
// credential is ever printed or committed.

import { spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { z } from 'zod'

import { isRecord } from '../../src/shared/utils/type-guards.ts'
import { unsafeCast } from '../../src/shared/utils/unsafe-cast.ts'

export const O2_IMAGE = 'openobserve/openobserve:v1.1.2'
export const O2_IMAGE_VERSION = 'v1.1.2'
export const O2_HTTP_PORT = 5080
export const DEFAULT_CONTAINER = 'kobato-openobserve-dev'
export const DEFAULT_VOLUME = 'kobato-openobserve-dev-data'
export const DEFAULT_ORG = 'default'
export const DEFAULT_O2_PORT = 5080
export const DEFAULT_APP_PORT = 4321
export const DEFAULT_APPLICATION_ID = 'kobato-dev'
export const RETENTION_DAYS = 1
export const RUM_STREAM = '_rumdata'
export const TRACE_STREAM = 'default'

// Closed ownership grammar. Arbitrary names from config/state must never reach
// a `docker rm`/`volume rm` call.
export const TRACE_CONTAINER_PATTERN = /^kobato-(?:openobserve-dev|trace-smoke-[a-f0-9]{8})$/
export const TRACE_VOLUME_PATTERN = /^kobato-(?:openobserve-dev-data|trace-smoke-[a-f0-9]{8}-data)$/

export function isTraceContainerName(name: string): boolean {
  return TRACE_CONTAINER_PATTERN.test(name)
}

export function isTraceVolumeName(name: string): boolean {
  return TRACE_VOLUME_PATTERN.test(name)
}

export interface TraceState {
  version: 1
  endpoint: string
  organization: string
  adminEmail: string
  adminPassword: string
  rumToken: string
  applicationId: string
  containerName: string
  volumeName: string
  port: number
  createdAt: string
}

export const traceStateSchema = z
  .object({
    version: z.literal(1),
    endpoint: z.url(),
    organization: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/),
    adminEmail: z.email(),
    adminPassword: z.string().min(1),
    rumToken: z.string(),
    applicationId: z.string().min(1).max(256),
    containerName: z.string().regex(TRACE_CONTAINER_PATTERN),
    volumeName: z.string().regex(TRACE_VOLUME_PATTERN),
    port: z.number().int().min(1).max(65535),
    createdAt: z.string().min(1),
  })
  .strict()

export function parseTraceState(value: unknown): TraceState | null {
  const parsed = traceStateSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}

export interface OpenObserveInstance {
  endpoint: string
  organization: string
  adminEmail: string
  adminPassword: string
  containerName: string
  volumeName: string
  port: number
  /** True when this call created the container rather than reusing one. */
  created: boolean
}

export function stateDirectory(): string {
  // Default inside the worktree's already-ignored `tmp/` tree. Nothing is
  // written under the user's home unless KOBATO_TRACE_STATE_DIR says so.
  return process.env.KOBATO_TRACE_STATE_DIR ?? resolve(import.meta.dirname, '..', '..', 'tmp', 'openobserve')
}

export function stateFilePath(): string {
  return join(stateDirectory(), 'state.json')
}

export function traceConfigFragmentPath(): string {
  return join(stateDirectory(), 'kobato.trace.json')
}

export async function readState(): Promise<TraceState | null> {
  try {
    const raw = await readFile(stateFilePath(), 'utf-8')
    return parseTraceState(JSON.parse(raw))
  } catch {
    return null
  }
}

export async function writeState(state: TraceState): Promise<string> {
  traceStateSchema.parse(state)
  const dir = stateDirectory()
  await mkdir(dir, { recursive: true, mode: 0o700 })
  const path = stateFilePath()
  await writeFile(path, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 })
  await chmod(path, 0o600)
  return path
}

export async function writeTraceConfigFragment(state: TraceState): Promise<string> {
  const fragment = {
    trace: {
      enabled: true,
      endpoint: state.endpoint,
      organization: state.organization,
      serverAuthorizationHeader: basicAuthorization(state.adminEmail, state.adminPassword),
      sampleRate: 1,
      includeRedactedSql: false,
      frontend: {
        enabled: true,
        applicationId: state.applicationId,
        clientToken: state.rumToken,
        sessionSampleRate: 100,
      },
    },
  }
  const path = traceConfigFragmentPath()
  await mkdir(dirname(path), { recursive: true, mode: 0o700 })
  await writeFile(path, `${JSON.stringify(fragment, null, 2)}\n`, { mode: 0o600 })
  await chmod(path, 0o600)
  return path
}

export function basicAuthorization(email: string, password: string): string {
  return `Basic ${Buffer.from(`${email}:${password}`, 'utf-8').toString('base64')}`
}

export function generatePassword(): string {
  // OpenObserve requires a non-trivial root password. Keep it out of every log.
  return `Kobato-${randomBytes(24).toString('base64url')}`
}

export function generateFixture(prefix: string): string {
  return `${prefix}-${randomBytes(6).toString('hex')}`
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms))
}

export function log(message: string): void {
  process.stdout.write(`${message}\n`)
}

export function warn(message: string): void {
  process.stderr.write(`${message}\n`)
}

export class TraceToolError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TraceToolError'
  }
}

export function fail(message: string): never {
  throw new TraceToolError(message)
}

export interface StateDefaults {
  endpoint?: string
  adminEmail?: string
  adminPassword?: string
  rumToken?: string
  applicationId?: string
  containerName?: string
  volumeName?: string
  port?: number
}

/** Build a state object; every mutable value has an explicit env override. */
export function buildState(overrides: StateDefaults = {}): TraceState {
  const port = overrides.port ?? Number(process.env.KOBATO_TRACE_PORT ?? DEFAULT_O2_PORT)
  const containerName = overrides.containerName ?? process.env.KOBATO_TRACE_CONTAINER ?? DEFAULT_CONTAINER
  const volumeName = overrides.volumeName ?? process.env.KOBATO_TRACE_VOLUME ?? DEFAULT_VOLUME
  return {
    version: 1,
    endpoint: overrides.endpoint ?? process.env.KOBATO_TRACE_ENDPOINT ?? `http://127.0.0.1:${port}`,
    organization: process.env.KOBATO_TRACE_ORG ?? DEFAULT_ORG,
    adminEmail: overrides.adminEmail ?? process.env.KOBATO_TRACE_ROOT_EMAIL ?? 'kobato-dev@example.invalid',
    adminPassword: overrides.adminPassword ?? process.env.KOBATO_TRACE_ROOT_PASSWORD ?? generatePassword(),
    rumToken: overrides.rumToken ?? process.env.KOBATO_TRACE_RUM_TOKEN ?? '',
    applicationId: overrides.applicationId ?? process.env.KOBATO_TRACE_APPLICATION_ID ?? DEFAULT_APPLICATION_ID,
    containerName,
    volumeName,
    port,
    createdAt: new Date().toISOString(),
  }
}

// ---------------------------------------------------------------------------
// Docker
// ---------------------------------------------------------------------------

export interface CommandResult {
  status: number
  stdout: string
  stderr: string
}

function redactArg(arg: string): string {
  if (arg.startsWith('ZO_ROOT_USER_PASSWORD=')) {
    return 'ZO_ROOT_USER_PASSWORD=***'
  }
  if (arg.startsWith('authorization:')) {
    return 'authorization: ***'
  }
  return arg
}

export function run(
  command: string,
  args: string[],
  options: { input?: string; allowFailure?: boolean } = {},
): CommandResult {
  const result = spawnSync(command, args, {
    encoding: 'utf-8',
    input: options.input,
    maxBuffer: 16 * 1024 * 1024,
  })
  if (result.error) {
    fail(`Could not run ${command}: ${result.error.message}`)
  }
  const status = result.status ?? 1
  if (status !== 0 && options.allowFailure !== true) {
    const detail = (result.stderr || result.stdout).trim()
    const rendered = [command, ...args.map(redactArg)].join(' ')
    fail(`${rendered} failed (exit ${status})${detail === '' ? '' : `: ${detail}`}`)
  }
  return { status, stdout: result.stdout, stderr: result.stderr }
}

export function docker(args: string[], options: { input?: string; allowFailure?: boolean } = {}): CommandResult {
  return run('docker', args, options)
}

export function ensureDocker(): void {
  const result = docker(['info'], { allowFailure: true })
  if (result.status !== 0) {
    fail('Docker is not available. Start Docker Desktop (or the Docker daemon) and retry.')
  }
}

export function imagePresent(): boolean {
  return docker(['image', 'inspect', O2_IMAGE], { allowFailure: true }).status === 0
}

export function ensureImage(): void {
  if (imagePresent()) {
    return
  }
  log(`==> pulling ${O2_IMAGE}`)
  docker(['pull', O2_IMAGE])
}

export function containerRunning(name: string): boolean {
  const result = docker(['inspect', '-f', '{{.State.Running}}', name], { allowFailure: true })
  return result.status === 0 && result.stdout.trim() === 'true'
}

export function containerExists(name: string): boolean {
  return docker(['inspect', name], { allowFailure: true }).status === 0
}

export function volumeExists(name: string): boolean {
  return docker(['volume', 'inspect', name], { allowFailure: true }).status === 0
}

function corsOrigins(): string {
  const configured = process.env.KOBATO_TRACE_CORS_ORIGINS
  if (configured !== undefined && configured.trim() !== '') {
    return configured
  }
  const appPort = Number(process.env.KOBATO_TRACE_APP_PORT ?? DEFAULT_APP_PORT)
  // Exact origins only — never a wildcard. Both loopback spellings map to the
  // same development server; OpenObserve matches the Origin header verbatim.
  return [`http://localhost:${appPort}`, `http://127.0.0.1:${appPort}`].join(',')
}

function labelValue(kind: 'container' | 'volume', name: string): string | null {
  const args =
    kind === 'container'
      ? ['inspect', '-f', '{{json .Config.Labels}}', name]
      : ['volume', 'inspect', '-f', '{{json .Labels}}', name]
  const result = docker(args, { allowFailure: true })
  if (result.status !== 0) {
    return null
  }
  try {
    const labels: unknown = JSON.parse(result.stdout)
    return isRecord(labels) && typeof labels['kobato.trace'] === 'string' ? labels['kobato.trace'] : null
  } catch {
    return null
  }
}

export function isOwnedTraceResource(kind: 'container' | 'volume', name: string, label: string | null): boolean {
  const grammar = kind === 'container' ? TRACE_CONTAINER_PATTERN : TRACE_VOLUME_PATTERN
  return grammar.test(name) && label === 'development'
}

export function containerOwnedByTrace(name: string): boolean {
  return isOwnedTraceResource('container', name, labelValue('container', name))
}

export function volumeOwnedByTrace(name: string): boolean {
  return isOwnedTraceResource('volume', name, labelValue('volume', name))
}

export interface StopResult {
  containerRemoved: boolean
  volumeRemoved: boolean
  refused: boolean
}

export function startOpenObserve(state: TraceState, options: { corsOrigins?: string } = {}): OpenObserveInstance {
  if (!isTraceContainerName(state.containerName) || !isTraceVolumeName(state.volumeName)) {
    fail('Refusing to use a container/volume name outside the kobato trace namespace.')
  }
  ensureDocker()
  ensureImage()
  if (volumeExists(state.volumeName) && !volumeOwnedByTrace(state.volumeName)) {
    fail(`Refusing to reuse volume ${state.volumeName}: missing kobato.trace=development label.`)
  }
  if (!volumeExists(state.volumeName)) {
    docker(['volume', 'create', '--label', 'kobato.trace=development', state.volumeName])
  }

  const base = {
    endpoint: state.endpoint,
    organization: state.organization,
    adminEmail: state.adminEmail,
    adminPassword: state.adminPassword,
    containerName: state.containerName,
    volumeName: state.volumeName,
    port: state.port,
  }

  if (containerExists(state.containerName)) {
    if (!containerOwnedByTrace(state.containerName)) {
      fail(`Refusing to reuse container ${state.containerName}: missing kobato.trace=development label.`)
    }
    if (!containerRunning(state.containerName)) {
      log(`==> starting existing container ${state.containerName}`)
      docker(['start', state.containerName])
    } else {
      log(`==> reusing running container ${state.containerName}`)
    }
    return { ...base, created: false }
  }

  log(`==> creating ${state.containerName} (${O2_IMAGE}) on 127.0.0.1:${state.port}`)
  docker([
    'run',
    '-d',
    '--name',
    state.containerName,
    '--label',
    'kobato.trace=development',
    '--restart',
    'no',
    '-p',
    `127.0.0.1:${state.port}:${O2_HTTP_PORT}`,
    '-e',
    `ZO_ROOT_USER_EMAIL=${state.adminEmail}`,
    '-e',
    `ZO_ROOT_USER_PASSWORD=${state.adminPassword}`,
    '-e',
    'ZO_DATA_DIR=/data',
    '-e',
    'ZO_TELEMETRY=false',
    // The smoke and local stack never inspect GeoIP fields; O2 otherwise
    // downloads ~59 MB of MaxMind data on startup and blocks `/healthz` until
    // it finishes. A slow network made the restart health wait flaky, so keep
    // the throwaway instance offline and deterministic.
    '-e',
    'ZO_MMDB_DISABLE_DOWNLOAD=true',
    '-e',
    `ZO_CORS_ALLOWED_ORIGINS=${options.corsOrigins ?? corsOrigins()}`,
    // Local development wants WAL data queryable in seconds, not the 10-minute
    // default. Retention remains day-granular (1 day, the OSS minimum).
    '-e',
    'ZO_MAX_FILE_RETENTION_TIME=10',
    '-e',
    'ZO_COMPACT_INTERVAL=10',
    '-v',
    `${state.volumeName}:/data`,
    O2_IMAGE,
  ])
  return { ...base, created: true }
}

export async function waitForOpenObserve(endpoint: string, timeoutMs = 90_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  let last = 'no response'
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${endpoint}/healthz`, { signal: AbortSignal.timeout(2000) })
      if (res.ok) {
        return
      }
      last = `HTTP ${res.status}`
    } catch (error) {
      last = error instanceof Error ? error.message : String(error)
    }
    await sleep(500)
  }
  fail(`OpenObserve did not become healthy at ${endpoint} within ${timeoutMs / 1000}s (${last})`)
}

export interface TraceDockerBoundary {
  containerExists(name: string): boolean
  volumeExists(name: string): boolean
  containerLabel(name: string): string | null
  volumeLabel(name: string): string | null
  removeContainer(name: string): void
  removeVolume(name: string): void
}

/** Injectable ownership/removal logic (unit-tested without Docker). */
export function removeOwnedTraceResources(
  name: string,
  removeVolume: boolean,
  volumeName: string | undefined,
  boundary: TraceDockerBoundary,
): StopResult {
  let containerRemoved = false
  let volumeRemoved = false
  let refused = false
  if (boundary.containerExists(name)) {
    if (!isOwnedTraceResource('container', name, boundary.containerLabel(name))) {
      warn(`==> refusing to remove container ${name}: missing/incorrect kobato.trace label`)
      refused = true
    } else {
      boundary.removeContainer(name)
      containerRemoved = true
      log(`==> removed container ${name}`)
    }
  }
  if (removeVolume && volumeName !== undefined && boundary.volumeExists(volumeName)) {
    if (!isOwnedTraceResource('volume', volumeName, boundary.volumeLabel(volumeName))) {
      warn(`==> refusing to remove volume ${volumeName}: missing/incorrect kobato.trace label`)
      refused = true
    } else {
      boundary.removeVolume(volumeName)
      volumeRemoved = true
      log(`==> removed volume ${volumeName}`)
    }
  }
  return { containerRemoved, volumeRemoved, refused }
}

export function stopOpenObserve(name: string, removeVolume: boolean, volumeName?: string): StopResult {
  return removeOwnedTraceResources(name, removeVolume, volumeName, {
    containerExists,
    volumeExists,
    containerLabel: (resource) => labelValue('container', resource),
    volumeLabel: (resource) => labelValue('volume', resource),
    removeContainer: (resource) => docker(['rm', '-f', resource]),
    removeVolume: (resource) => docker(['volume', 'rm', '-f', resource]),
  })
}

// ---------------------------------------------------------------------------
// OpenObserve HTTP API
// ---------------------------------------------------------------------------

export interface O2Context {
  endpoint: string
  organization: string
  authorization: string
}

export function o2Context(state: TraceState): O2Context {
  return {
    endpoint: state.endpoint,
    organization: state.organization,
    authorization: basicAuthorization(state.adminEmail, state.adminPassword),
  }
}

async function o2Request(ctx: O2Context, path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers)
  headers.set('authorization', ctx.authorization)
  if (init.body !== undefined && !headers.has('content-type')) {
    headers.set('content-type', 'application/json')
  }
  const url = `${ctx.endpoint}/api/${encodeURIComponent(ctx.organization)}${path}`
  const res = await fetch(url, { ...init, headers })
  if (!res.ok) {
    const text = await res.text()
    const body = text.slice(0, 2000)
    throw new TraceToolError(`${init.method ?? 'GET'} ${path} failed: HTTP ${res.status} ${body}`)
  }
  return res
}

export async function o2Json<T>(ctx: O2Context, path: string, init: RequestInit = {}): Promise<T> {
  const res = await o2Request(ctx, path, init)
  return unsafeCast<T>(await res.json())
}

export interface StreamInfo {
  name: string
  stream_type: string
  settings?: { data_retention?: number }
}

export async function listStreams(ctx: O2Context, type: 'logs' | 'traces' | 'metrics'): Promise<StreamInfo[]> {
  const data = await o2Json<{ list?: StreamInfo[] }>(ctx, `/streams?type=${type}`)
  return data.list ?? []
}

export async function setRetention(ctx: O2Context, stream: StreamInfo, days = RETENTION_DAYS): Promise<void> {
  await o2Request(ctx, `/streams/${encodeURIComponent(stream.name)}/settings?type=${stream.stream_type}`, {
    method: 'PUT',
    body: JSON.stringify({ data_retention: days }),
  })
}

export async function getRumToken(ctx: O2Context): Promise<string | null> {
  const result = await fetch(`${ctx.endpoint}/api/${encodeURIComponent(ctx.organization)}/rumtoken`, {
    headers: { authorization: ctx.authorization },
  })
  if (result.status === 404) {
    return null
  }
  if (!result.ok) {
    return null
  }
  const body = unsafeCast<{ data?: { rum_token?: string } }>(await result.json())
  return body.data?.rum_token ?? null
}

export async function createRumToken(ctx: O2Context): Promise<string> {
  const body = await o2Json<{ data?: { rum_token?: string } }>(ctx, '/rumtoken', {
    method: 'POST',
    body: '{}',
  })
  const token = body.data?.rum_token
  if (token === undefined || token === '') {
    throw new TraceToolError('OpenObserve did not return a RUM token')
  }
  return token
}

export interface FunctionRecord {
  name: string
  function: string
  transType?: number
}

export async function upsertFunction(ctx: O2Context, transform: FunctionRecord): Promise<void> {
  const list = await o2Json<{ list?: FunctionRecord[] }>(ctx, '/functions')
  const exists = (list.list ?? []).some((entry) => entry.name === transform.name)
  const path = exists ? `/functions/${encodeURIComponent(transform.name)}` : '/functions'
  await o2Request(ctx, path, {
    method: exists ? 'PUT' : 'POST',
    body: JSON.stringify({ ...transform, transType: transform.transType ?? 0 }),
  })
}

export interface PipelineRecord {
  pipeline_id?: string
  version?: number
  enabled?: boolean
  name: string
  description: string
  source: Record<string, unknown>
  nodes: unknown[]
  edges: unknown[]
}

export async function upsertPipeline(ctx: O2Context, pipeline: PipelineRecord): Promise<string> {
  const list = await o2Json<{ list?: PipelineRecord[] }>(ctx, '/pipelines')
  const existing = (list.list ?? []).find((entry) => entry.name === pipeline.name)
  if (existing?.pipeline_id !== undefined) {
    const current = await o2Json<PipelineRecord>(ctx, `/pipelines/${encodeURIComponent(existing.pipeline_id)}`)
    await o2Request(ctx, '/pipelines', {
      method: 'PUT',
      body: JSON.stringify({
        ...pipeline,
        pipeline_id: current.pipeline_id,
        version: current.version ?? 0,
      }),
    })
    return existing.pipeline_id
  }
  const created = await o2Json<{ id?: string }>(ctx, '/pipelines', {
    method: 'POST',
    body: JSON.stringify(pipeline),
  })
  if (created.id === undefined) {
    throw new TraceToolError('OpenObserve did not return a pipeline id')
  }
  return created.id
}

export interface DashboardSummary {
  dashboardId: string
  title: string
}

interface DashboardListResponse {
  dashboards?: Array<{
    hash?: string
    v8?: { dashboardId?: string; title?: string }
  }>
}

export async function listDashboards(ctx: O2Context): Promise<Array<DashboardSummary & { hash?: string }>> {
  const data = await o2Json<DashboardListResponse>(ctx, '/dashboards?folder=default')
  return (data.dashboards ?? []).flatMap((entry) => {
    const id = entry.v8?.dashboardId
    const title = entry.v8?.title
    if (id === undefined || title === undefined) {
      return []
    }
    return [{ dashboardId: id, title, hash: entry.hash }]
  })
}

export async function upsertDashboard(ctx: O2Context, body: Record<string, unknown>): Promise<string> {
  const title = typeof body.title === 'string' ? body.title : ''
  const dashboards = await listDashboards(ctx)
  const existing = dashboards.find((dashboard) => dashboard.title === title)
  if (existing === undefined) {
    const created = await o2Json<{ v8?: { dashboardId?: string } }>(ctx, '/dashboards?folder=default', {
      method: 'POST',
      body: JSON.stringify(body),
    })
    return created.v8?.dashboardId ?? 'created'
  }
  const params = new URLSearchParams({ folder: 'default' })
  if (existing.hash !== undefined) {
    params.set('hash', existing.hash)
  }
  await o2Request(ctx, `/dashboards/${encodeURIComponent(existing.dashboardId)}?${params.toString()}`, {
    method: 'PUT',
    body: JSON.stringify({ ...body, dashboardId: existing.dashboardId }),
  })
  return existing.dashboardId
}

export interface SearchOptions {
  type: 'logs' | 'traces' | 'metrics'
  sql: string
  startTimeMs?: number
  endTimeMs?: number
  size?: number
}

export interface SearchResponse {
  hits?: Array<Record<string, unknown>>
  total?: number
  [key: string]: unknown
}

export async function search(ctx: O2Context, options: SearchOptions): Promise<SearchResponse> {
  const now = Date.now()
  const body = {
    query: {
      sql: options.sql,
      start_time: (options.startTimeMs ?? now - 60 * 60 * 1000) * 1000,
      end_time: (options.endTimeMs ?? now + 60 * 1000) * 1000,
      from: 0,
      size: options.size ?? 100,
    },
  }
  return o2Json<SearchResponse>(ctx, `/_search?type=${options.type}`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function searchCount(ctx: O2Context, options: SearchOptions): Promise<number> {
  const result = await search(ctx, options)
  return result.total ?? result.hits?.length ?? 0
}

export function endpointFromState(state: TraceState): string {
  return state.endpoint
}

export function resolveFromRepo(relative: string): string {
  return resolve(import.meta.dirname, '../..', relative)
}
