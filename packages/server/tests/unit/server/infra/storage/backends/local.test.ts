import { __setStorageDirForTests } from '@kobato/server/infra/data-paths.ts'
import { ActionFailure } from '@kobato/server/infra/http/errors.ts'
import { StorageObjectNotFound } from '@kobato/server/infra/storage/backend.ts'
import { localBackend, resolveLocalPath } from '@kobato/server/infra/storage/backends/local.ts'
import { existsSync, mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'

const root = mkdtempSync(join(tmpdir(), 'local-storage-'))
__setStorageDirForTests(root)

afterAll(() => {
  __setStorageDirForTests(null)
  rmSync(root, { recursive: true, force: true })
})

describe('storage/local — resolveLocalPath (security)', () => {
  it('accepts a normal namespaced key', () => {
    expect(() => resolveLocalPath('images/2026/05/x.jpg')).not.toThrow()
  })

  it.each([
    ['empty', ''],
    ['absolute', '/etc/passwd'],
    ['parent traversal', 'images/../../etc/passwd'],
    ['leading parent', '../secret'],
    ['NUL byte', 'images/x\x00.jpg'],
    ['control char', 'images/x\x07.jpg'],
    ['DEL', 'images/x\x7f.jpg'],
  ])('rejects %s keys', (_label, key) => {
    expect(() => resolveLocalPath(key)).toThrow(ActionFailure)
  })

  it('carries a typed invalid-path descriptor instead of prose', () => {
    try {
      resolveLocalPath('../secret')
    } catch (error) {
      expect(error).toMatchObject({
        descriptor: { messageKey: 'storage.error.invalidPath', params: { key: '../secret' } },
      })
      return
    }
    throw new Error('resolveLocalPath unexpectedly accepted a traversal key')
  })
})

describe('storage/local — put/get round-trip', () => {
  beforeEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  it('writes then reads the same bytes and reports size', async () => {
    const body = Buffer.from('hello-local-storage')
    const meta = await localBackend.put({ key: 'images/a.jpg', body, contentType: 'image/jpeg' })
    expect(meta.size).toBe(body.length)
    expect(meta.etag).toBeDefined()
    expect(await localBackend.get('images/a.jpg')).toEqual(body)
  })

  it('creates nested directories as needed', async () => {
    await localBackend.put({ key: 'musics/2026/track.mp3', body: Buffer.from([1, 2, 3]), contentType: 'audio/mpeg' })
    expect(existsSync(`${root}/musics/2026/track.mp3`)).toBe(true)
  })

  it('leaves no .tmp-* file behind after a successful write (atomic rename)', async () => {
    await localBackend.put({ key: 'images/a.jpg', body: Buffer.from('x'), contentType: 'image/jpeg' })
    const all = readdirSync(root, { recursive: true }) as string[]
    expect(all.some((p) => p.includes('.tmp-'))).toBe(false)
  })

  it('throws StorageObjectNotFound when reading a missing object', async () => {
    await expect(localBackend.get('nope.jpg')).rejects.toBeInstanceOf(StorageObjectNotFound)
  })

  it('throws StorageObjectNotFound when streaming a missing object', async () => {
    await expect(localBackend.getStream('nope.jpg')).rejects.toBeInstanceOf(StorageObjectNotFound)
  })

  it('StorageObjectNotFound still maps to a 404 at the HTTP perimeter', async () => {
    await expect(localBackend.get('nope.jpg')).rejects.toMatchObject({
      status: 404,
      descriptor: { messageKey: 'storage.error.objectNotFound', params: { key: 'nope.jpg' } },
    })
  })

  it('exists() reflects presence', async () => {
    expect(await localBackend.exists('images/a.jpg')).toBe(false)
    await localBackend.put({ key: 'images/a.jpg', body: Buffer.from('y'), contentType: 'image/jpeg' })
    expect(await localBackend.exists('images/a.jpg')).toBe(true)
  })
})

describe('storage/local — private-object permissions', () => {
  beforeEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  it('creates a private object 0600 with a 0700 directory', async () => {
    await localBackend.put({
      key: 'backup/backup-2026-01-01T00-00-00-0123456789abcdef.db.tar.gz',
      body: Buffer.from('dump'),
      contentType: 'application/gzip',
      visibility: 'private',
    })

    expect(statSync(`${root}/backup`).mode & 0o777).toBe(0o700)
    expect(statSync(`${root}/backup/backup-2026-01-01T00-00-00-0123456789abcdef.db.tar.gz`).mode & 0o777).toBe(0o600)
  })

  it('creates a private STREAMED object 0600', async () => {
    await localBackend.putStream({
      key: 'audit-log/2026-01.jsonl.gz',
      body: Readable.from([Buffer.from('archive')]),
      contentType: 'application/gzip',
      visibility: 'private',
    })

    expect(statSync(`${root}/audit-log`).mode & 0o777).toBe(0o700)
    expect(statSync(`${root}/audit-log/2026-01.jsonl.gz`).mode & 0o777).toBe(0o600)
  })

  it('leaves public objects on the process defaults (umask-derived, not forced owner-only)', async () => {
    await localBackend.put({ key: 'images/a.jpg', body: Buffer.from('x'), contentType: 'image/jpeg' })

    expect(statSync(`${root}/images`).mode & 0o777).toBe(0o777 & ~process.umask())
    expect(statSync(`${root}/images/a.jpg`).mode & 0o777).toBe(0o666 & ~process.umask())
  })
})

describe('storage/local — delete + list', () => {
  beforeEach(async () => {
    rmSync(root, { recursive: true, force: true })
    await localBackend.put({ key: 'images/a.jpg', body: Buffer.from('a'), contentType: 'image/jpeg' })
    await localBackend.put({ key: 'images/sub/b.jpg', body: Buffer.from('bb'), contentType: 'image/jpeg' })
    await localBackend.put({ key: 'musics/c.mp3', body: Buffer.from('ccc'), contentType: 'audio/mpeg' })
  })

  it('delete removes the object', async () => {
    await localBackend.delete('images/a.jpg')
    expect(await localBackend.exists('images/a.jpg')).toBe(false)
  })

  it('delete on a missing object is a no-op (no throw)', async () => {
    await expect(localBackend.delete('images/missing.jpg')).resolves.toBeUndefined()
  })

  it('deleteMany removes each key', async () => {
    await localBackend.deleteMany(['images/a.jpg', 'musics/c.mp3'])
    expect(await localBackend.exists('images/a.jpg')).toBe(false)
    expect(await localBackend.exists('musics/c.mp3')).toBe(false)
    expect(await localBackend.exists('images/sub/b.jpg')).toBe(true)
  })

  it('list walks recursively under a prefix and reports size', async () => {
    const items = await localBackend.list('images/')
    expect(items.map((i) => i.key).sort()).toEqual(['images/a.jpg', 'images/sub/b.jpg'])
    expect(items.find((i) => i.key === 'images/sub/b.jpg')?.size).toBe(2)
  })

  it('list honours maxKeys by returning a sorted prefix', async () => {
    const items = await localBackend.list('images/', { maxKeys: 1 })
    expect(items).toHaveLength(1)
    expect(items[0]?.key).toBe('images/a.jpg')
  })

  it('deleteMany stays correct when destructured off the backend (no `this` reliance)', async () => {
    const { deleteMany } = localBackend
    await deleteMany(['images/a.jpg', 'musics/c.mp3'])
    expect(await localBackend.exists('images/a.jpg')).toBe(false)
    expect(await localBackend.exists('musics/c.mp3')).toBe(false)
  })
})

describe('storage/local — directory keys resolve to StorageObjectNotFound, not EISDIR', () => {
  beforeEach(async () => {
    rmSync(root, { recursive: true, force: true })
    await localBackend.put({ key: 'images/a.jpg', body: Buffer.from('a'), contentType: 'image/jpeg' })
  })

  it('get() on a directory key throws StorageObjectNotFound', async () => {
    await expect(localBackend.get('images')).rejects.toBeInstanceOf(StorageObjectNotFound)
  })

  it('getStream() on a directory key throws StorageObjectNotFound', async () => {
    await expect(localBackend.getStream('images')).rejects.toBeInstanceOf(StorageObjectNotFound)
  })
})
