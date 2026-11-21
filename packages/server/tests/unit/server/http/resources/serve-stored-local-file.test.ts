import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

await import('@kobato/server/infra/data-paths')
const { __setStorageDirForTests } = await import('@kobato/server/infra/data-paths')
const { IMMUTABLE_CACHE_CONTROL, serveStoredLocalFile } = await import('@kobato/server/http/resources/serve-local-file')

const root = mkdtempSync(join(tmpdir(), 'serve-stored-local-file-'))
__setStorageDirForTests(root)

beforeAll(() => {
  mkdirSync(`${root}/images`, { recursive: true })
  writeFileSync(`${root}/images/example.txt`, 'hello')
})

afterAll(() => {
  __setStorageDirForTests(null)
  rmSync(root, { recursive: true, force: true })
})

describe('serveStoredLocalFile', () => {
  const request = (key: string) =>
    serveStoredLocalFile({
      key,
      contentType: 'text/plain; charset=utf-8',
      cacheControl: IMMUTABLE_CACHE_CONTROL,
      headers: { ifNoneMatch: undefined, range: undefined },
      logName: { scope: 'test.local-file', target: 'test object' },
    })

  it('resolves, stats, and serves a stored file', async () => {
    const response = await request('images/example.txt')
    expect(response.status).toBe(200)
    expect(await response.text()).toBe('hello')
  })

  it('maps a missing stored file to 404', async () => {
    expect((await request('images/missing.txt')).status).toBe(404)
  })

  it('maps an invalid storage key to 400', async () => {
    expect((await request('../outside.txt')).status).toBe(400)
  })
})
