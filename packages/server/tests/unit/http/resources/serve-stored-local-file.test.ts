import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

const tmp = vi.hoisted(() => ({ root: '' }))

vi.mock('@kobato/server/infra/paths', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@kobato/server/infra/paths')>()
  const fs = await import('node:fs')
  const os = await import('node:os')
  const path = await import('node:path')
  tmp.root = fs.mkdtempSync(path.join(os.tmpdir(), 'serve-stored-local-file-'))
  return { ...actual, STORAGE_DIR: tmp.root }
})

await import('@kobato/server/infra/paths')
const { IMMUTABLE_CACHE_CONTROL, serveStoredLocalFile } = await import('@kobato/server/http/resources/serve-local-file')

beforeAll(() => {
  mkdirSync(`${tmp.root}/images`, { recursive: true })
  writeFileSync(`${tmp.root}/images/example.txt`, 'hello')
})

afterAll(() => {
  rmSync(tmp.root, { recursive: true, force: true })
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
