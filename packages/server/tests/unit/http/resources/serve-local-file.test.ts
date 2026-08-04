import {
  IMMUTABLE_CACHE_CONTROL,
  parseRange,
  respondWithLocalFile,
} from '@kobato/server/http/resources/serve-local-file'
import { mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

describe('parseRange', () => {
  it('returns null when the header is absent or not a bytes unit', () => {
    expect(parseRange(undefined, 100)).toBeNull()
    expect(parseRange('items=0-9', 100)).toBeNull()
  })

  it('parses a normal start-end range', () => {
    expect(parseRange('bytes=0-9', 100)).toEqual({ start: 0, end: 9, total: 100 })
  })

  it('clamps an end beyond the file size', () => {
    expect(parseRange('bytes=90-999', 100)).toEqual({ start: 90, end: 99, total: 100 })
  })

  it('parses an open-ended range (empty endRaw) as start..EOF', () => {
    expect(parseRange('bytes=2-', 100)).toEqual({ start: 2, end: 99, total: 100 })
  })

  it('parses a suffix range as the last N bytes', () => {
    expect(parseRange('bytes=-10', 100)).toEqual({ start: 90, end: 99, total: 100 })
  })

  it('clamps a suffix range larger than the file to the whole file', () => {
    expect(parseRange('bytes=-200', 100)).toEqual({ start: 0, end: 99, total: 100 })
  })

  it('rejects a zero or non-numeric suffix as unsatisfiable', () => {
    expect(parseRange('bytes=-0', 100)).toBe('unsatisfiable')
    expect(parseRange('bytes=-abc', 100)).toBe('unsatisfiable')
  })

  it('rejects a start beyond the file size as unsatisfiable', () => {
    expect(parseRange('bytes=100-200', 100)).toBe('unsatisfiable')
  })

  it('rejects end < start as unsatisfiable', () => {
    expect(parseRange('bytes=5-2', 100)).toBe('unsatisfiable')
  })

  it('returns null for multi-range specs (unsupported, client may retry single)', () => {
    expect(parseRange('bytes=0-1,3-4', 100)).toBeNull()
  })

  it('returns null for non-numeric bounds', () => {
    expect(parseRange('bytes=abc-def', 100)).toBeNull()
    expect(parseRange('bytes=abc-', 100)).toBeNull()
  })
})

describe('respondWithLocalFile', () => {
  let dir = ''
  let file = ''
  let mtimeMs = 0
  const BODY = 'hello world' // 11 bytes

  const input = (overrides: Partial<Parameters<typeof respondWithLocalFile>[0]> = {}) => ({
    absPath: file,
    size: BODY.length,
    mtimeMs,
    contentType: 'text/plain; charset=utf-8',
    cacheControl: IMMUTABLE_CACHE_CONTROL,
    ifNoneMatch: undefined,
    range: undefined,
    ...overrides,
  })

  beforeAll(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'serve-local-file-'))
    file = path.join(dir, 'a.txt')
    writeFileSync(file, BODY)
    mtimeMs = Math.floor(statSync(file).mtimeMs)
  })

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('serves the full file with the base headers on a plain GET', async () => {
    const res = respondWithLocalFile(input())
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('text/plain; charset=utf-8')
    expect(res.headers.get('Cache-Control')).toBe(IMMUTABLE_CACHE_CONTROL)
    expect(res.headers.get('ETag')).toBe(`"${BODY.length}-${mtimeMs}"`)
    expect(res.headers.get('AcceptRanges')).toBe('bytes')
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff')
    expect(res.headers.get('Content-Length')).toBe('11')
    expect(await res.text()).toBe(BODY)
  })

  it('short-circuits 304 when If-None-Match equals the etag', async () => {
    const res = respondWithLocalFile(input({ ifNoneMatch: `"${BODY.length}-${mtimeMs}"` }))
    expect(res.status).toBe(304)
    expect(res.headers.get('ETag')).toBe(`"${BODY.length}-${mtimeMs}"`)
    expect(await res.text()).toBe('')
  })

  it('short-circuits 304 when If-None-Match is *', async () => {
    const res = respondWithLocalFile(input({ ifNoneMatch: '*' }))
    expect(res.status).toBe(304)
    expect(await res.text()).toBe('')
  })

  it('ignores a non-matching If-None-Match and serves 200', async () => {
    const res = respondWithLocalFile(input({ ifNoneMatch: '"999-0"' }))
    expect(res.status).toBe(200)
    expect(await res.text()).toBe(BODY)
  })

  it('serves 416 with Content-Range bytes */size for an unsatisfiable range', async () => {
    const res = respondWithLocalFile(input({ range: 'bytes=50-60' }))
    expect(res.status).toBe(416)
    expect(res.headers.get('Content-Range')).toBe('bytes */11')
    expect(res.headers.get('ETag')).toBe(`"${BODY.length}-${mtimeMs}"`)
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff')
    expect(await res.text()).toBe('')
  })

  it('serves 206 with the sliced body for a valid range', async () => {
    const res = respondWithLocalFile(input({ range: 'bytes=0-4' }))
    expect(res.status).toBe(206)
    expect(res.headers.get('Content-Range')).toBe('bytes 0-4/11')
    expect(res.headers.get('Content-Length')).toBe('5')
    expect(res.headers.get('ETag')).toBe(`"${BODY.length}-${mtimeMs}"`)
    expect(await res.text()).toBe('hello')
  })
})
