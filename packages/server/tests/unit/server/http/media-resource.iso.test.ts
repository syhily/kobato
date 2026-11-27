import { lookupStoredLocalObject } from '@kobato/server/domains/storage/local-object'
import { mediaFileAnswer, parseByteRange } from '@kobato/server/http/media-resource'
import { __setStorageDirForTests } from '@kobato/server/infra/data-paths'
import { mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const REPRESENTATION = { contentType: 'text/plain; charset=utf-8', cacheControl: 'public, max-age=31536000, immutable' }
const WIRE_CACHE_CONTROL = `${REPRESENTATION.cacheControl}, no-transform`

describe('parseByteRange', () => {
  it('returns null when the header is absent or not a bytes unit', () => {
    expect(parseByteRange(undefined, 100)).toBeNull()
    expect(parseByteRange('items=0-9', 100)).toBeNull()
  })

  it('parses a normal start-end range', () => {
    expect(parseByteRange('bytes=0-9', 100)).toEqual({ start: 0, end: 9 })
  })

  it('clamps an end beyond the file size', () => {
    expect(parseByteRange('bytes=90-999', 100)).toEqual({ start: 90, end: 99 })
  })

  it('parses an open-ended range (empty endRaw) as start..EOF', () => {
    expect(parseByteRange('bytes=2-', 100)).toEqual({ start: 2, end: 99 })
  })

  it('parses a suffix range as the last N bytes', () => {
    expect(parseByteRange('bytes=-10', 100)).toEqual({ start: 90, end: 99 })
  })

  it('clamps a suffix range larger than the file to the whole file', () => {
    expect(parseByteRange('bytes=-200', 100)).toEqual({ start: 0, end: 99 })
  })

  it('rejects a zero or non-numeric suffix as unsatisfiable', () => {
    expect(parseByteRange('bytes=-0', 100)).toBe('unsatisfiable')
    expect(parseByteRange('bytes=-abc', 100)).toBe('unsatisfiable')
  })

  it('rejects a start beyond the file size as unsatisfiable', () => {
    expect(parseByteRange('bytes=100-200', 100)).toBe('unsatisfiable')
  })

  it('rejects end < start as unsatisfiable', () => {
    expect(parseByteRange('bytes=5-2', 100)).toBe('unsatisfiable')
  })

  it('returns null for multi-range specs (unsupported, client may retry single)', () => {
    expect(parseByteRange('bytes=0-1,3-4', 100)).toBeNull()
  })

  it('returns null for non-numeric bounds', () => {
    expect(parseByteRange('bytes=abc-def', 100)).toBeNull()
    expect(parseByteRange('bytes=abc-', 100)).toBeNull()
  })
})

describe('mediaFileAnswer', () => {
  let dir = ''
  let file = ''
  let mtimeMs = 0
  const BODY = 'hello world'

  const object = () => ({
    absPath: file,
    size: BODY.length,
    etag: `"${BODY.length}-${mtimeMs}"`,
  })

  const input = (overrides: { ifNoneMatch?: string; range?: string } = {}) => ({
    ifNoneMatch: undefined,
    range: undefined,
    ...overrides,
  })

  beforeAll(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'media-file-answer-'))
    file = path.join(dir, 'a.txt')
    writeFileSync(file, BODY)
    mtimeMs = Math.floor(statSync(file).mtimeMs)
  })

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('answers a full stream with the base headers on a plain GET', async () => {
    const answer = mediaFileAnswer(object(), input(), REPRESENTATION)
    if (answer.kind !== 'stream') {
      throw new Error(`expected a stream answer, got ${answer.kind}`)
    }
    expect(answer.status).toBe(200)
    expect(answer.headers['Content-Type']).toBe('text/plain; charset=utf-8')
    expect(answer.headers['Cache-Control']).toBe(WIRE_CACHE_CONTROL)
    expect(answer.headers.ETag).toBe(`"${BODY.length}-${mtimeMs}"`)
    expect(answer.headers['Accept-Ranges']).toBe('bytes')
    expect(answer.headers['X-Content-Type-Options']).toBe('nosniff')
    expect(answer.headers['Content-Length']).toBe('11')
    expect(await readBody(answer)).toBe(BODY)
  })

  it('answers not-modified when If-None-Match equals the etag', () => {
    const answer = mediaFileAnswer(object(), input({ ifNoneMatch: `"${BODY.length}-${mtimeMs}"` }), REPRESENTATION)
    expect(answer).toEqual({
      kind: 'not-modified',
      answer: {
        kind: 'not-modified',
        etag: `"${BODY.length}-${mtimeMs}"`,
        contentType: REPRESENTATION.contentType,
        cacheControl: WIRE_CACHE_CONTROL,
        contentLanguage: null,
      },
    })
  })

  it('answers not-modified when If-None-Match is *', () => {
    const answer = mediaFileAnswer(object(), input({ ifNoneMatch: '*' }), REPRESENTATION)
    expect(answer.kind).toBe('not-modified')
  })

  it('ignores a non-matching If-None-Match and streams 200', async () => {
    const answer = mediaFileAnswer(object(), input({ ifNoneMatch: '"999-0"' }), REPRESENTATION)
    if (answer.kind !== 'stream') {
      throw new Error(`expected a stream answer, got ${answer.kind}`)
    }
    expect(answer.status).toBe(200)
    expect(await readBody(answer)).toBe(BODY)
  })

  it('answers range-not-satisfiable with bytes */size for an unsatisfiable range', () => {
    const answer = mediaFileAnswer(object(), input({ range: 'bytes=50-60' }), REPRESENTATION)
    expect(answer).toEqual({
      kind: 'range-not-satisfiable',
      answer: {
        kind: 'range-not-satisfiable',
        etag: `"${BODY.length}-${mtimeMs}"`,
        contentRange: 'bytes */11',
        contentType: REPRESENTATION.contentType,
        cacheControl: WIRE_CACHE_CONTROL,
        contentLanguage: null,
      },
    })
  })

  it('answers a sliced 206 stream for a valid range', async () => {
    const answer = mediaFileAnswer(object(), input({ range: 'bytes=0-4' }), REPRESENTATION)
    if (answer.kind !== 'stream') {
      throw new Error(`expected a stream answer, got ${answer.kind}`)
    }
    expect(answer.status).toBe(206)
    expect(answer.headers['Content-Range']).toBe('bytes 0-4/11')
    expect(answer.headers['Content-Length']).toBe('5')
    expect(answer.headers.ETag).toBe(`"${BODY.length}-${mtimeMs}"`)
    expect(await readBody(answer)).toBe('hello')
  })
})

describe('lookupStoredLocalObject', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'lookup-stored-'))
  __setStorageDirForTests(root)

  afterAll(() => {
    __setStorageDirForTests(null)
    rmSync(root, { recursive: true, force: true })
  })

  it('maps a stored key to its stat-backed etag and absolute path', async () => {
    mkdirSync(path.join(root, 'images'), { recursive: true })
    writeFileSync(path.join(root, 'images', 'a.jpg'), 'img')
    const lookup = await lookupStoredLocalObject('images/a.jpg', 'test.scope', 'test target')
    expect(lookup).not.toBe('invalid-path')
    expect(lookup).not.toBe('missing')
    if (lookup !== 'invalid-path' && lookup !== 'missing') {
      expect(lookup.absPath).toBe(path.join(root, 'images', 'a.jpg'))
      expect(lookup.size).toBe(3)
      expect(lookup.etag).toBe(`"3-${Math.floor(statSync(path.join(root, 'images', 'a.jpg')).mtimeMs)}"`)
    }
  })

  it('answers invalid-path for escape attempts and empty keys', async () => {
    expect(await lookupStoredLocalObject('../backup/secret', 'test.scope', 'test target')).toBe('invalid-path')
    expect(await lookupStoredLocalObject('', 'test.scope', 'test target')).toBe('invalid-path')
  })

  it('answers missing for absent keys and directories', async () => {
    expect(await lookupStoredLocalObject('images/absent.jpg', 'test.scope', 'test target')).toBe('missing')
    expect(await lookupStoredLocalObject('images', 'test.scope', 'test target')).toBe('missing')
  })
})

async function readBody(answer: ReturnType<typeof mediaFileAnswer>): Promise<string> {
  if (answer.kind !== 'stream') {
    throw new Error('expected a stream answer')
  }
  const chunks: string[] = []
  for await (const chunk of answer.output) {
    chunks.push(new TextDecoder().decode(chunk))
  }
  return chunks.join('')
}
