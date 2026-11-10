// Provisioning shared by `trace:init` and `trace:smoke`: RUM token, retention,
// the RUM privacy pipeline, and the four versioned dashboards.

import { createHash } from 'node:crypto'
import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'

import type { O2Context, StreamInfo, TraceState } from './lib.ts'

import {
  RUM_PRIVACY_FUNCTION_NAME,
  RUM_PRIVACY_PIPELINE_DESCRIPTION,
  RUM_PRIVACY_PIPELINE_NAME,
  RUM_PRIVACY_VRL_SHA256,
} from '../../src/shared/contracts/trace-pipeline.ts'
import { unsafeCast } from '../../src/shared/utils/unsafe-cast.ts'
import {
  createRumToken,
  getRumToken,
  isRelevantTraceStream,
  listStreams,
  RETENTION_DAYS,
  RUM_STREAM,
  setRetention,
  upsertDashboard,
  upsertFunction,
  upsertPipeline,
} from './lib.ts'

const DASHBOARD_DIR = join(import.meta.dirname, 'assets', 'dashboards')

export async function ensureRumToken(
  ctx: O2Context,
  state: TraceState,
  persist: (next: TraceState) => Promise<void>,
): Promise<TraceState> {
  if (state.rumToken !== '') {
    const current = await getRumToken(ctx)
    if (current === state.rumToken) {
      return state
    }
  }
  const token = await createRumToken(ctx)
  const updated = { ...state, rumToken: token }
  await persist(updated)
  return updated
}

export interface RetentionReport {
  applied: number
  missing: boolean
  streams: Array<{ name: string; type: string; retention: number }>
}

export async function applyRetention(ctx: O2Context): Promise<RetentionReport> {
  const streams: StreamInfo[] = []
  for (const type of ['logs', 'traces', 'metrics'] as const) {
    const list = await listStreams(ctx, type)
    for (const stream of list) {
      streams.push({ ...stream, stream_type: type })
    }
  }
  // Only Kobato-relevant streams: `_rumdata` (RUM), `default` (traces),
  // `kobato_logs` (server logs), and the closed metric prefixes.
  const relevant = streams.filter((stream) => isRelevantTraceStream(stream.name))
  let applied = 0
  for (const stream of relevant) {
    if ((stream.settings?.data_retention ?? 0) !== RETENTION_DAYS) {
      await setRetention(ctx, stream, RETENTION_DAYS)
      applied += 1
    }
  }
  return {
    applied,
    missing: relevant.length === 0,
    streams: relevant.map((stream) => ({
      name: stream.name,
      type: stream.stream_type,
      retention: stream.settings?.data_retention ?? RETENTION_DAYS,
    })),
  }
}

export async function installPrivacyPipeline(ctx: O2Context): Promise<void> {
  const raw = await readFile(join(import.meta.dirname, 'assets', 'rum-privacy.vrl'), 'utf-8')
  const vrl = raw.trim()
  const hash = createHash('sha256').update(vrl, 'utf8').digest('hex')
  if (hash !== RUM_PRIVACY_VRL_SHA256) {
    throw new Error('rum-privacy.vrl changed without updating RUM_PRIVACY_VRL_SHA256')
  }
  await upsertFunction(ctx, { name: RUM_PRIVACY_FUNCTION_NAME, function: vrl, transType: 0 })
  await upsertPipeline(ctx, {
    name: RUM_PRIVACY_PIPELINE_NAME,
    description: RUM_PRIVACY_PIPELINE_DESCRIPTION,
    enabled: true,
    source: {
      source_type: 'realtime',
      org_id: ctx.organization,
      stream_name: RUM_STREAM,
      stream_type: 'logs',
    },
    nodes: [
      {
        id: 'input',
        data: {
          node_type: 'stream',
          org_id: ctx.organization,
          stream_name: RUM_STREAM,
          stream_type: 'logs',
        },
        position: { x: 0, y: 0 },
        io_type: 'input',
      },
      {
        id: 'privacy',
        data: { node_type: 'function', name: RUM_PRIVACY_FUNCTION_NAME, after_flatten: true },
        position: { x: 240, y: 0 },
        io_type: 'default',
      },
      {
        id: 'output',
        data: {
          node_type: 'stream',
          org_id: ctx.organization,
          stream_name: RUM_STREAM,
          stream_type: 'logs',
        },
        position: { x: 480, y: 0 },
        io_type: 'output',
      },
    ],
    edges: [
      { id: 'einput-privacy', source: 'input', target: 'privacy' },
      { id: 'eprivacy-output', source: 'privacy', target: 'output' },
    ],
  })
}

export async function importDashboards(ctx: O2Context): Promise<number> {
  const entries = await readdir(DASHBOARD_DIR)
  const files = entries.filter((name) => name.endsWith('.json')).sort()
  let imported = 0
  for (const file of files) {
    const body = unsafeCast<Record<string, unknown>>(JSON.parse(await readFile(join(DASHBOARD_DIR, file), 'utf-8')))
    await upsertDashboard(ctx, body)
    imported += 1
  }
  return imported
}

export interface ProvisionReport {
  dashboards: number
  retention: RetentionReport
}

export async function provisionOpenObserve(ctx: O2Context): Promise<ProvisionReport> {
  await installPrivacyPipeline(ctx)
  const dashboards = await importDashboards(ctx)
  const retention = await applyRetention(ctx)
  return { dashboards, retention }
}
