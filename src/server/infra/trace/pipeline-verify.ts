// Startup verifier for the OpenObserve RUM privacy pipeline (ADR-0012).
//
// This is a server-only probe using the same OTLP authorization value as the
// exporter. It verifies the pipeline wiring AND the actual stored function
// body hash, not just a human-readable description. It never logs the
// credential and never throws: a false result withholds only the browser
// bootstrap, while server traces/metrics continue.

import { createHash } from 'node:crypto'

import type { ServerTraceRuntimeConfig } from '@/server/infra/trace/config'

import {
  RUM_PRIVACY_FUNCTION_NAME,
  RUM_PRIVACY_HASH_MARKER,
  RUM_PRIVACY_PIPELINE_DESCRIPTION,
  RUM_PRIVACY_PIPELINE_NAME,
  RUM_PRIVACY_VRL_SHA256,
  RUM_PRIVACY_VERSION_MARKER,
} from '@/shared/contracts/trace-pipeline'
import { isRecord } from '@/shared/utils/type-guards'

export const RUM_PRIVACY_VERIFY_TIMEOUT_MS = 1500

export type FrontendPipelineVerifier = (config: ServerTraceRuntimeConfig) => Promise<boolean>

/** O2 stores the submitted VRL with a trailing ` \n .` sentinel. */
export function canonicalFunctionBody(body: string): string {
  return body.replace(/ \n \.$/, '')
}

export function sha256Text(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

function nodeData(value: unknown): Record<string, unknown> | null {
  return isRecord(value) && isRecord(value.data) ? value.data : null
}

function verifiedPipeline(value: unknown, organization: string): boolean {
  if (!isRecord(value)) {
    return false
  }
  const source = isRecord(value.source) ? value.source : null
  if (
    value.name !== RUM_PRIVACY_PIPELINE_NAME ||
    value.enabled !== true ||
    typeof value.description !== 'string' ||
    !value.description.includes(RUM_PRIVACY_VERSION_MARKER) ||
    !value.description.includes(RUM_PRIVACY_HASH_MARKER) ||
    source === null ||
    source.source_type !== 'realtime' ||
    source.org_id !== organization ||
    source.stream_name !== '_rumdata' ||
    source.stream_type !== 'logs' ||
    !Array.isArray(value.nodes) ||
    !Array.isArray(value.edges) ||
    value.nodes.length !== 3 ||
    value.edges.length !== 2
  ) {
    return false
  }

  const nodes: unknown[] = value.nodes
  const input = nodes.find((node) => isRecord(node) && node.io_type === 'input')
  const fn = nodes.find((node) => isRecord(node) && node.io_type === 'default')
  const output = nodes.find((node) => isRecord(node) && node.io_type === 'output')
  if (!isRecord(input) || !isRecord(fn) || !isRecord(output)) {
    return false
  }
  const inputData = nodeData(input)
  const fnData = nodeData(fn)
  const outputData = nodeData(output)
  if (
    inputData === null ||
    fnData === null ||
    outputData === null ||
    input.is_disabled === true ||
    fn.is_disabled === true ||
    output.is_disabled === true ||
    inputData.node_type !== 'stream' ||
    inputData.stream_name !== '_rumdata' ||
    inputData.stream_type !== 'logs' ||
    inputData.org_id !== organization ||
    fnData.node_type !== 'function' ||
    fnData.name !== RUM_PRIVACY_FUNCTION_NAME ||
    fnData.after_flatten !== true ||
    outputData.node_type !== 'stream' ||
    outputData.stream_name !== '_rumdata' ||
    outputData.stream_type !== 'logs' ||
    outputData.org_id !== organization ||
    typeof input.id !== 'string' ||
    typeof fn.id !== 'string' ||
    typeof output.id !== 'string'
  ) {
    return false
  }

  const edges: unknown[] = value.edges
  const hasEdge = (sourceId: string, targetId: string) =>
    edges.some(
      (edge) => isRecord(edge) && edge.source === sourceId && edge.target === targetId && edge.id !== undefined,
    )
  return hasEdge(input.id, fn.id) && hasEdge(fn.id, output.id)
}

function verifiedFunctionBody(payload: unknown): boolean {
  if (!isRecord(payload) || !Array.isArray(payload.list)) {
    return false
  }
  const list: unknown[] = payload.list
  const fn = list.find((entry) => isRecord(entry) && entry.name === RUM_PRIVACY_FUNCTION_NAME)
  if (!isRecord(fn) || fn.transType !== 0 || typeof fn.function !== 'string') {
    return false
  }
  const body = canonicalFunctionBody(fn.function)
  return sha256Text(body) === RUM_PRIVACY_VRL_SHA256
}

function containsVerifiedPipeline(payload: unknown, organization: string): boolean {
  if (!isRecord(payload) || !Array.isArray(payload.list)) {
    return false
  }
  return payload.list.some((entry) => verifiedPipeline(entry, organization))
}

async function fetchJson(config: ServerTraceRuntimeConfig, path: string, signal: AbortSignal): Promise<unknown> {
  const url = `${config.endpoint}/api/${encodeURIComponent(config.organization)}${path}`
  const res = await fetch(url, {
    headers: { authorization: config.authorizationHeader, accept: 'application/json' },
    signal,
  })
  if (!res.ok) {
    return null
  }
  return res.json()
}

export async function verifyRumPrivacyPipeline(
  config: ServerTraceRuntimeConfig,
  timeoutMs = RUM_PRIVACY_VERIFY_TIMEOUT_MS,
): Promise<boolean> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  timer.unref?.()
  try {
    const [pipelines, functions] = await Promise.all([
      fetchJson(config, '/pipelines', controller.signal),
      fetchJson(config, '/functions', controller.signal),
    ])
    return containsVerifiedPipeline(pipelines, config.organization) && verifiedFunctionBody(functions)
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}

/** Exported for focused tests without a live OpenObserve. */
export const __pipelineVerification = {
  verifiedPipeline,
  verifiedFunctionBody,
  description: RUM_PRIVACY_PIPELINE_DESCRIPTION,
  expectedHash: RUM_PRIVACY_VRL_SHA256,
}
