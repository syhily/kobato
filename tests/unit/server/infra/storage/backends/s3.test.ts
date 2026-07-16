import { Readable } from 'node:stream'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { AssetsSettings, BlogSettingsBundle } from '@/shared/config/types'

import { TEST_BLOG_SETTINGS_BUNDLE } from '#/_helpers/blog-settings'

type AnySend = (...args: unknown[]) => Promise<unknown>

const sendMock = vi.fn<AnySend>()
const destroyMock = vi.fn()
const constructSpy = vi.fn()
const middlewareStack = {
  addRelativeTo: vi.fn(),
}

vi.mock('@aws-sdk/client-s3', () => {
  class S3Client {
    send = sendMock
    destroy = destroyMock
    middlewareStack = middlewareStack
    constructor(public config: unknown) {
      constructSpy(config)
    }
  }
  class PutObjectCommand {
    constructor(public input: unknown) {}
  }
  class ListObjectsV2Command {
    constructor(public input: unknown) {}
  }
  class GetObjectCommand {
    constructor(public input: unknown) {}
  }
  class HeadObjectCommand {
    constructor(public input: unknown) {}
  }
  class DeleteObjectCommand {
    constructor(public input: unknown) {}
  }
  class DeleteObjectsCommand {
    constructor(public input: unknown) {}
  }
  return {
    S3Client,
    PutObjectCommand,
    ListObjectsV2Command,
    GetObjectCommand,
    HeadObjectCommand,
    DeleteObjectCommand,
    DeleteObjectsCommand,
  }
})

let snapshotSlot: (typeof import('@/shared/config/snapshot'))['BLOG_SETTINGS_SNAPSHOT_SLOT'] | null = null

async function importBackend() {
  vi.resetModules()
  const snapshot = await import('@/shared/config/snapshot')
  snapshotSlot = snapshot.BLOG_SETTINGS_SNAPSHOT_SLOT
  snapshot.BLOG_SETTINGS_SNAPSHOT_SLOT.write(TEST_BLOG_SETTINGS_BUNDLE)
  snapshot.BLOG_SETTINGS_SNAPSHOT_SLOT.writeHydration(Promise.resolve(TEST_BLOG_SETTINGS_BUNDLE))
  const mod = await import('@/server/infra/storage/backends/s3')
  return mod.s3Backend
}

function setBundle(bundle: BlogSettingsBundle) {
  snapshotSlot?.write(bundle)
  snapshotSlot?.writeHydration(Promise.resolve(bundle))
}

type StorageOverrides = Partial<AssetsSettings['storage']>

function bundleWithStorage(overrides: StorageOverrides): BlogSettingsBundle {
  const assets = TEST_BLOG_SETTINGS_BUNDLE.assets!
  return {
    ...TEST_BLOG_SETTINGS_BUNDLE,
    assets: { ...assets, storage: { ...assets.storage, ...overrides } },
  }
}

function commandInput(call: number) {
  return (sendMock.mock.calls[call]![0] as { input: Record<string, unknown> }).input
}

beforeEach(() => {
  sendMock.mockReset()
  destroyMock.mockReset()
  constructSpy.mockReset()
  middlewareStack.addRelativeTo.mockReset()
})

describe('storage/backends/s3 — isAvailable', () => {
  it('is available under the fully-configured fixture', async () => {
    const backend = await importBackend()
    expect(backend.isAvailable()).toBe(true)
  })

  it('is unavailable when the upload toggle is off', async () => {
    const backend = await importBackend()
    setBundle(bundleWithStorage({ enabled: false }))
    expect(backend.isAvailable()).toBe(false)
  })

  it.each(['endpoint', 'bucket', 'accessKeyId', 'secretAccessKey'])(
    'is unavailable when half-configured (%s empty)',
    async (field) => {
      const backend = await importBackend()
      setBundle(bundleWithStorage({ [field]: '' } as StorageOverrides))
      expect(backend.isAvailable()).toBe(false)
    },
  )
})

describe('storage/backends/s3 — put', () => {
  it('sends a PutObjectCommand with the public immutable Cache-Control by default', async () => {
    const backend = await importBackend()
    sendMock.mockResolvedValue({})
    await backend.put({ key: 'a.png', body: Buffer.from('x'), contentType: 'image/png' })
    const input = commandInput(0)
    expect(input.Key).toBe('a.png')
    expect(input.ContentType).toBe('image/png')
    expect(input.CacheControl).toBe('public, max-age=31536000, immutable')
  })

  it('honours a custom Cache-Control', async () => {
    const backend = await importBackend()
    sendMock.mockResolvedValue({})
    await backend.put({ key: 'a.png', body: Buffer.from('x'), contentType: 'image/png', cacheControl: 'no-cache' })
    expect(commandInput(0).CacheControl).toBe('no-cache')
  })

  it('maps private visibility to the private Cache-Control', async () => {
    const backend = await importBackend()
    sendMock.mockResolvedValue({})
    await backend.put({ key: 'a.png', body: Buffer.from('x'), contentType: 'image/png', visibility: 'private' })
    expect(commandInput(0).CacheControl).toBe('private, max-age=31536000')
  })

  it('rejects with ActionFailure(503) when storage is disabled', async () => {
    const backend = await importBackend()
    setBundle(bundleWithStorage({ enabled: false }))
    await expect(backend.put({ key: 'a', body: Buffer.from('x'), contentType: 'image/png' })).rejects.toMatchObject({
      status: 503,
    })
  })

  it('rejects with ActionFailure(503) when secretAccessKey is empty', async () => {
    const backend = await importBackend()
    setBundle(bundleWithStorage({ secretAccessKey: '' }))
    await expect(backend.put({ key: 'a', body: Buffer.from('x'), contentType: 'image/png' })).rejects.toMatchObject({
      status: 503,
    })
  })
})

describe('storage/backends/s3 — putStream', () => {
  it('streams with the private Cache-Control', async () => {
    const backend = await importBackend()
    sendMock.mockResolvedValue({})
    const body = Readable.from([Buffer.from('x')])
    await backend.putStream!({ key: 'backup/b.sql.gz', body, contentType: 'application/gzip' })
    expect(commandInput(0).CacheControl).toBe('private, max-age=31536000')
  })
})

describe('storage/backends/s3 — client cache', () => {
  it('reuses the S3 client while the config fingerprint is unchanged', async () => {
    const backend = await importBackend()
    sendMock.mockResolvedValue({})
    await backend.put({ key: 'a', body: Buffer.from('x'), contentType: 'image/png' })
    await backend.put({ key: 'b', body: Buffer.from('y'), contentType: 'image/png' })
    expect(constructSpy).toHaveBeenCalledTimes(1)
    expect(destroyMock).not.toHaveBeenCalled()
  })

  it('configures checksum settings for streaming compatibility', async () => {
    const backend = await importBackend()
    sendMock.mockResolvedValue({})
    await backend.put({ key: 'a', body: Buffer.from('x'), contentType: 'image/png' })
    expect(constructSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        requestChecksumCalculation: 'WHEN_REQUIRED',
        responseChecksumValidation: 'WHEN_REQUIRED',
      }),
    )
  })

  it('installs the DeleteObjects MD5 fallback middleware', async () => {
    const backend = await importBackend()
    sendMock.mockResolvedValue({})
    await backend.put({ key: 'a', body: Buffer.from('x'), contentType: 'image/png' })
    expect(middlewareStack.addRelativeTo).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({ name: 'addMD5ChecksumForDeleteObjects' }),
    )
  })

  it('destroys the stale client when the fingerprint changes', async () => {
    const backend = await importBackend()
    sendMock.mockResolvedValue({})
    await backend.put({ key: 'a', body: Buffer.from('x'), contentType: 'image/png' })
    setBundle(bundleWithStorage({ bucket: 'other-bucket' }))
    await backend.put({ key: 'b', body: Buffer.from('y'), contentType: 'image/png' })
    expect(destroyMock).toHaveBeenCalled()
    expect(constructSpy).toHaveBeenCalledTimes(2)
  })
})

describe('storage/backends/s3 — exists', () => {
  it('returns true when HeadObject resolves', async () => {
    const backend = await importBackend()
    sendMock.mockResolvedValue({})
    await expect(backend.exists('k')).resolves.toBe(true)
  })

  it('returns false on a NotFound error', async () => {
    const backend = await importBackend()
    sendMock.mockRejectedValue(Object.assign(new Error('nf'), { name: 'NotFound' }))
    await expect(backend.exists('k')).resolves.toBe(false)
  })

  it('returns false on a 404 status code', async () => {
    const backend = await importBackend()
    sendMock.mockRejectedValue({ $metadata: { httpStatusCode: 404 } })
    await expect(backend.exists('k')).resolves.toBe(false)
  })

  it('treats any other failure as absent', async () => {
    const backend = await importBackend()
    sendMock.mockRejectedValue(new Error('boom'))
    await expect(backend.exists('k')).resolves.toBe(false)
  })

  it('ignores the upload toggle (reads must work with uploads off)', async () => {
    const backend = await importBackend()
    setBundle(bundleWithStorage({ enabled: false }))
    sendMock.mockResolvedValue({})
    await expect(backend.exists('k')).resolves.toBe(true)
  })
})

describe('storage/backends/s3 — get', () => {
  it('throws ActionFailure(404) when Body is undefined', async () => {
    const backend = await importBackend()
    sendMock.mockResolvedValue({ Body: undefined })
    await expect(backend.get('key')).rejects.toMatchObject({ status: 404 })
  })

  it('resolves with the concatenated buffer', async () => {
    const backend = await importBackend()
    const stream = new Readable()
    stream.push(Buffer.from('hello'))
    stream.push(Buffer.from('world'))
    stream.push(null)
    sendMock.mockResolvedValue({ Body: stream, ContentLength: 10 })
    const buf = await backend.get('key')
    expect(buf.toString()).toBe('helloworld')
  })

  it('rejects when ContentLength exceeds MAX_OBJECT_BUFFER_SIZE', async () => {
    const backend = await importBackend()
    const stream = new Readable()
    stream.push(Buffer.alloc(50, 'x'))
    stream.push(null)
    // ContentLength already over the cap → 413 before any streaming.
    sendMock.mockResolvedValue({ Body: stream, ContentLength: 101 * 1024 * 1024 })
    await expect(backend.get('key')).rejects.toMatchObject({ status: 413 })
  })

  it('rejects mid-stream when the body grows past MAX_OBJECT_BUFFER_SIZE', async () => {
    const backend = await importBackend()
    // ContentLength unknown (chunked response) — the cap is enforced while
    // streaming. One 60 MB buffer pushed twice crosses the 100 MB cap.
    const chunk = Buffer.alloc(60 * 1024 * 1024, 'x')
    const stream = new Readable()
    stream.push(chunk)
    stream.push(chunk)
    stream.push(null)
    sendMock.mockResolvedValue({ Body: stream, ContentLength: undefined })
    await expect(backend.get('key')).rejects.toMatchObject({ status: 413 })
  })

  it('propagates stream errors', async () => {
    const backend = await importBackend()
    const stream = new Readable({ read() {} })
    sendMock.mockResolvedValue({ Body: stream, ContentLength: undefined })
    const promise = backend.get('key')
    await new Promise((r) => setImmediate(r))
    stream.destroy(new Error('boom'))
    await expect(promise).rejects.toThrow('boom')
  })
})

describe('storage/backends/s3 — list', () => {
  it('returns parsed contents and stops pagination when NextContinuationToken is absent', async () => {
    const backend = await importBackend()
    sendMock.mockResolvedValue({
      Contents: [
        { Key: 'a', Size: 10, LastModified: new Date('2024-01-01') },
        { Key: 'b', Size: 20, LastModified: new Date('2024-02-01') },
      ],
    })
    const out = await backend.list('prefix')
    expect(out).toHaveLength(2)
    expect(out[0]).toMatchObject({ key: 'a', size: 10 })
  })

  it('aborts pagination when exceeding maxKeys', async () => {
    const backend = await importBackend()
    let i = 0
    sendMock.mockImplementation(() => {
      i += 1
      return Promise.resolve({
        Contents: [
          { Key: `k${i}`, Size: 1, LastModified: new Date('2024-01-01') },
          { Key: `k${i}-2`, Size: 1, LastModified: new Date('2024-01-01') },
        ],
        NextContinuationToken: 'tok',
      })
    })
    const out = await backend.list('prefix', { maxKeys: 3 })
    expect(out.length).toBeLessThanOrEqual(5)
  })

  it('skips entries missing key / size / lastModified', async () => {
    const backend = await importBackend()
    sendMock.mockResolvedValue({
      Contents: [
        { Key: 'ok', Size: 1, LastModified: new Date('2024-01-01') },
        { Key: undefined, Size: 1, LastModified: new Date('2024-01-01') },
        { Key: 'no-size', LastModified: new Date('2024-01-01') },
      ],
    })
    const out = await backend.list('p')
    expect(out).toEqual([{ key: 'ok', size: 1, lastModified: new Date('2024-01-01') }])
  })
})

describe('storage/backends/s3 — delete / deleteMany', () => {
  it('sends a DeleteObjectCommand', async () => {
    const backend = await importBackend()
    sendMock.mockResolvedValue({})
    await backend.delete('k')
    expect(sendMock).toHaveBeenCalledTimes(1)
    expect(commandInput(0).Key).toBe('k')
  })

  it('deleteMany short-circuits when keys is empty', async () => {
    const backend = await importBackend()
    await backend.deleteMany([])
    expect(sendMock).not.toHaveBeenCalled()
  })

  it('deleteMany sends a DeleteObjectsCommand for multiple keys', async () => {
    const backend = await importBackend()
    sendMock.mockResolvedValue({})
    await backend.deleteMany(['a', 'b'])
    expect(sendMock).toHaveBeenCalledTimes(1)
    expect(commandInput(0).Delete).toEqual({ Objects: [{ Key: 'a' }, { Key: 'b' }] })
  })
})

describe('storage/backends/s3 — deletePrefix', () => {
  it('lists, batch-deletes, then removes the folder marker', async () => {
    const backend = await importBackend()
    sendMock.mockResolvedValueOnce({
      Contents: [
        { Key: 'images/a', Size: 1, LastModified: new Date('2024-01-01') },
        { Key: 'images/b', Size: 1, LastModified: new Date('2024-01-01') },
      ],
    })
    sendMock.mockResolvedValue({})

    await backend.deletePrefix('images/')

    expect(sendMock).toHaveBeenCalledTimes(3)
    expect(commandInput(1).Delete).toEqual({ Objects: [{ Key: 'images/a' }, { Key: 'images/b' }] })
    expect(commandInput(2).Key).toBe('images/')
  })

  it('swallows a missing folder marker', async () => {
    const backend = await importBackend()
    sendMock.mockResolvedValueOnce({ Contents: [] })
    sendMock.mockRejectedValueOnce(new Error('NotFound'))

    await expect(backend.deletePrefix('images/')).resolves.toBeUndefined()
    expect(sendMock).toHaveBeenCalledTimes(2)
  })
})
