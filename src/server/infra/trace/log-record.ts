// Log-line projection for the DEV-only OpenObserve log pipeline (ADR-0012).
//
// This module is SDK-free and never imports the logger: the DEV runtime feeds
// it the serialized Pino lines captured by the log sink, and only what this
// projection returns can leave the process. Messages are a closed shape (a
// fixed HTTP phrase or a sanitized non-HTTP static message); request ids,
// URLs, headers, host/pid, arbitrary context, error messages, stacks, and
// causes have no route through here.

import { projectError } from '@/server/infra/trace/sanitize'

export const LOG_LINE_MAX_BYTES = 32 * 1024
export const LOG_BODY_MAX_LENGTH = 200

export type LogSeverityText = 'INFO' | 'WARN' | 'ERROR' | 'FATAL'

/** The closed attribute set of a projected log record. */
export interface ProjectedLogAttributes {
  'log.scope'?: string
  'http.request.method'?: string
  'http.response.status_code'?: number
  'error.type'?: string
  'error.category'?: string
}

export interface ProjectedLogRecord {
  timestampMs: number
  /** OpenTelemetry severity number (INFO 9, WARN 13, ERROR 17, FATAL 21). */
  severityNumber: number
  severityText: LogSeverityText
  body?: string
  attributes: ProjectedLogAttributes
}

export type LogLineDropReason = 'oversize' | 'malformed' | 'severity' | 'marker' | 'shape' | 'internal'

export type LogLineProjection = { kind: 'ok'; record: ProjectedLogRecord } | { kind: 'drop'; reason: LogLineDropReason }

interface Severity {
  text: LogSeverityText
  number: number
}

const SEVERITIES = new Map<string, Severity>([
  ['info', { text: 'INFO', number: 9 }],
  ['warn', { text: 'WARN', number: 13 }],
  ['error', { text: 'ERROR', number: 17 }],
  ['fatal', { text: 'FATAL', number: 21 }],
])

const ERROR_SEVERITY_NUMBER = 17
const SCOPE_PATTERN = /^[A-Za-z][A-Za-z0-9._:-]{0,63}$/
const METHOD_PATTERN = /^[A-Z]{3,10}$/
const ISO_TIME_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/
const MESSAGE_MARKERS = ['{E}', '{/E}', '[REDACTED]']

type JsonRecord = Record<string, unknown>

function stripControlCharacters(value: string): string {
  let cleaned = ''
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0
    if (code >= 0x20 && code !== 0x7f) {
      cleaned += character
    }
  }
  return cleaned
}

function isPlainObject(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readStatus(value: unknown): number | null {
  if (!isPlainObject(value)) {
    return null
  }
  const status = value.status
  return typeof status === 'number' && Number.isInteger(status) && status >= 100 && status <= 599 ? status : null
}

function readMethod(value: unknown): string | null {
  if (!isPlainObject(value)) {
    return null
  }
  const method = value.method
  return typeof method === 'string' && METHOD_PATTERN.test(method) ? method : null
}

function projectTimestamp(value: unknown, now: number): number {
  if (typeof value === 'string' && ISO_TIME_PATTERN.test(value)) {
    const parsed = Date.parse(value)
    if (Number.isFinite(parsed)) {
      return parsed
    }
  }
  return now
}

/**
 * The whole scope decides whether the record is allowed out. `trace` is the
 * telemetry subsystem's own scope: projecting it would feed the log pipeline
 * with its own output, so the record is dropped outright. An absent scope gets
 * the surface default; a present-but-invalid one stays out of the attributes.
 */
function readScope(value: unknown, isHttp: boolean): { drop: boolean; scope: string | undefined } {
  if (value === undefined || value === null) {
    return { drop: false, scope: isHttp ? 'http' : 'app' }
  }
  if (value === 'trace') {
    return { drop: true, scope: undefined }
  }
  if (typeof value === 'string' && SCOPE_PATTERN.test(value)) {
    return { drop: false, scope: value }
  }
  return { drop: false, scope: undefined }
}

/** Non-HTTP message body: marker-bearing lines never leave, control chars are stripped, length is bounded. */
function projectMessage(value: unknown): { drop: boolean; body: string | undefined } {
  if (typeof value !== 'string') {
    return { drop: false, body: undefined }
  }
  if (MESSAGE_MARKERS.some((marker) => value.includes(marker))) {
    return { drop: true, body: undefined }
  }
  const cleaned = stripControlCharacters(value)
  return { drop: false, body: cleaned === '' ? undefined : cleaned.slice(0, LOG_BODY_MAX_LENGTH) }
}

/** HTTP records never read the original message: the body is one of three fixed phrases. */
function projectHttpBody(severityNumber: number, status: number | null): string {
  if (severityNumber >= ERROR_SEVERITY_NUMBER || (status !== null && status >= 500)) {
    return 'HTTP request failed'
  }
  if (status !== null && status >= 400) {
    return 'HTTP request rejected'
  }
  return 'HTTP request completed'
}

function project(line: string, now: number): LogLineProjection {
  if (Buffer.byteLength(line, 'utf8') > LOG_LINE_MAX_BYTES) {
    return { kind: 'drop', reason: 'oversize' }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(line)
  } catch {
    return { kind: 'drop', reason: 'malformed' }
  }
  if (!isPlainObject(parsed)) {
    return { kind: 'drop', reason: 'shape' }
  }

  const severity = typeof parsed.level === 'string' ? SEVERITIES.get(parsed.level) : undefined
  if (severity === undefined) {
    return { kind: 'drop', reason: 'severity' }
  }

  const isHttp = isPlainObject(parsed.req)
  const scope = readScope(parsed.scope, isHttp)
  if (scope.drop) {
    return { kind: 'drop', reason: 'shape' }
  }

  const status = readStatus(parsed.res)
  let body: string | undefined
  if (isHttp) {
    body = projectHttpBody(severity.number, status)
  } else {
    const message = projectMessage(parsed.msg)
    if (message.drop) {
      return { kind: 'drop', reason: 'marker' }
    }
    body = message.body
  }

  const attributes: ProjectedLogAttributes = {}
  if (scope.scope !== undefined) {
    attributes['log.scope'] = scope.scope
  }
  const method = readMethod(parsed.req)
  if (method !== null) {
    attributes['http.request.method'] = method
  }
  if (status !== null) {
    attributes['http.response.status_code'] = status
  }
  const error = parsed.error ?? parsed.err
  if (error !== undefined) {
    const projection = projectError(error)
    attributes['error.type'] = projection.type
    attributes['error.category'] = projection.category
  }

  const record: ProjectedLogRecord = {
    timestampMs: projectTimestamp(parsed.time, now),
    severityNumber: severity.number,
    severityText: severity.text,
    attributes,
  }
  if (body !== undefined) {
    record.body = body
  }
  return { kind: 'ok', record }
}

/**
 * Project one serialized Pino line. Never throws: any unexpected failure is a
 * drop, because a broken line must not reach the caller's loop.
 */
export function projectLogLine(line: string, now: number): LogLineProjection {
  try {
    return project(line, now)
  } catch {
    return { kind: 'drop', reason: 'internal' }
  }
}
