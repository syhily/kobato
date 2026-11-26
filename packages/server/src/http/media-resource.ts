import type { RangeNotSatisfiable, ResourceNotModified } from '@kobato/api/contracts/primitives'
import type { StoredLocalObject } from '@kobato/server/domains/storage/local-object'

import { openStoredLocalObject } from '@kobato/server/domains/storage/local-object'

export interface MediaRepresentation {
  contentType: string
  cacheControl: string
}

export interface MediaFileHeadersInput {
  ifNoneMatch: string | undefined
  range: string | undefined
}

export function parseByteRange(
  header: string | undefined,
  size: number,
): { start: number; end: number } | 'unsatisfiable' | null {
  if (header === undefined || !header.startsWith('bytes=')) {
    return null
  }
  const spec = header.slice(6).trim()
  if (spec.includes(',')) {
    return null
  }
  const [startRaw, endRaw] = spec.split('-')
  let start: number
  let end: number
  if (startRaw === '') {
    const n = Number.parseInt(endRaw, 10)
    if (!Number.isFinite(n) || n <= 0) {
      return 'unsatisfiable'
    }
    start = Math.max(0, size - n)
    end = size - 1
  } else {
    start = Number.parseInt(startRaw, 10)
    end = endRaw === '' ? size - 1 : Number.parseInt(endRaw, 10)
    if (!Number.isFinite(start) || (!Number.isFinite(end) && endRaw !== '')) {
      return null
    }
  }
  if (start < 0 || start >= size || end < start) {
    return 'unsatisfiable'
  }
  return { start, end: Math.min(end, size - 1) }
}

export function mediaMatchesValidator(ifNoneMatch: string | undefined, etag: string): boolean {
  return ifNoneMatch !== undefined && (ifNoneMatch === etag || ifNoneMatch === '*')
}

export type MediaFileAnswer =
  | { kind: 'not-modified'; answer: ResourceNotModified }
  | { kind: 'range-not-satisfiable'; answer: RangeNotSatisfiable }
  | { kind: 'stream'; output: ReadableStream<Uint8Array>; status: number; headers: Record<string, string> }

export function mediaFileAnswer(
  object: StoredLocalObject,
  input: MediaFileHeadersInput,
  representation: MediaRepresentation,
): MediaFileAnswer {
  const cacheControl = `${representation.cacheControl}, no-transform`
  if (mediaMatchesValidator(input.ifNoneMatch, object.etag)) {
    return {
      kind: 'not-modified',
      answer: {
        kind: 'not-modified',
        etag: object.etag,
        contentType: representation.contentType,
        cacheControl,
        contentLanguage: null,
      },
    }
  }
  const baseHeaders: Record<string, string> = {
    'Content-Type': representation.contentType,
    'Cache-Control': cacheControl,
    ETag: object.etag,
    'Accept-Ranges': 'bytes',
    'X-Content-Type-Options': 'nosniff',
  }
  const range = parseByteRange(input.range, object.size)
  if (range === 'unsatisfiable') {
    return {
      kind: 'range-not-satisfiable',
      answer: {
        kind: 'range-not-satisfiable',
        etag: object.etag,
        contentRange: `bytes */${object.size}`,
        contentType: representation.contentType,
        cacheControl,
        contentLanguage: null,
      },
    }
  }
  if (range !== null) {
    const { start, end } = range
    return {
      kind: 'stream',
      output: openStoredLocalObject(object.absPath, start, end),
      status: 206,
      headers: {
        ...baseHeaders,
        'Content-Length': String(end - start + 1),
        'Content-Range': `bytes ${start}-${end}/${object.size}`,
      },
    }
  }
  return {
    kind: 'stream',
    output: openStoredLocalObject(object.absPath),
    status: 200,
    headers: { ...baseHeaders, 'Content-Length': String(object.size) },
  }
}
