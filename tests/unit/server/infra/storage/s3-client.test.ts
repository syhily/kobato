import { Readable } from 'node:stream'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { BlogSettingsBundle } from '@/shared/config/types'

import { TEST_BLOG_SETTINGS_BUNDLE } from '#/_helpers/blog-settings'

type AnySend = (...args: unknown[]) => Promise<unknown>

const sendMock = vi.fn<AnySend>()
const destroyMock = vi.fn()
const middlewareStack = {
  addRelativeTo: vi.fn(),
}

vi.mock('@aws-sdk/client-s3', () => {
  class S3Client {
    send = sendMock
    destroy = destroyMock
    middlewareStack = middlewareStack
    constructor(public config: unknown) {}
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
    DeleteObjectCommand,
    DeleteObjectsCommand,
  }
})

let snapshotSlot: (typeof import('@/shared/config/snapshot'))['BLOG_SETTINGS_SNAPSHOT_SLOT'] | null = null

async function importS3() {
  vi.resetModules()
  const snapshot = await import('@/shared/config/snapshot')
  snapshotSlot = snapshot.BLOG_SETTINGS_SNAPSHOT_SLOT
  snapshot.BLOG_SETTINGS_SNAPSHOT_SLOT.write(TEST_BLOG_SETTINGS_BUNDLE)
  snapshot.BLOG_SETTINGS_SNAPSHOT_SLOT.writeHydration(Promise.resolve(TEST_BLOG_SETTINGS_BUNDLE))
  return await import('@/server/infra/storage/s3-client')
}

function setBundle(bundle: BlogSettingsBundle) {
  snapshotSlot?.write(bundle)
  snapshotSlot?.writeHydration(Promise.resolve(bundle))
}

beforeEach(() => {
  sendMock.mockReset()
  destroyMock.mockReset()
  middlewareStack.addRelativeTo.mockReset()
})

describe('infra/storage/s3-client — getS3StorageContext', () => {
  it('throws ActionFailure when storage is disabled', async () => {
    const { getS3StorageContext } = await importS3()
    const assets = TEST_BLOG_SETTINGS_BUNDLE.assets!
    setBundle({
      ...TEST_BLOG_SETTINGS_BUNDLE,
      assets: {
        ...assets,
        storage: { ...assets.storage, enabled: false },
      },
    })
    await expect(getS3StorageContext()).rejects.toMatchObject({ status: 503 })
  })

  it('throws ActionFailure when secretAccessKey is empty', async () => {
    const { getS3StorageContext } = await importS3()
    const assets = TEST_BLOG_SETTINGS_BUNDLE.assets!
    setBundle({
      ...TEST_BLOG_SETTINGS_BUNDLE,
      assets: {
        ...assets,
        storage: { ...assets.storage, secretAccessKey: '' },
      },
    })
    await expect(getS3StorageContext()).rejects.toMatchObject({ status: 503 })
  })

  it('skips the enabled check when requireEnabled is false', async () => {
    const { getS3StorageContext } = await importS3()
    const assets = TEST_BLOG_SETTINGS_BUNDLE.assets!
    setBundle({
      ...TEST_BLOG_SETTINGS_BUNDLE,
      assets: {
        ...assets,
        storage: { ...assets.storage, enabled: false, secretAccessKey: 'k' },
      },
    })
    const ctx = await getS3StorageContext({ requireEnabled: false })
    expect(ctx.bucket).toBe(assets.storage.bucket)
    expect(middlewareStack.addRelativeTo).toHaveBeenCalled()
  })

  it('caches the S3 client when the config fingerprint is unchanged', async () => {
    const { getS3StorageContext } = await importS3()
    const a = await getS3StorageContext()
    const b = await getS3StorageContext()
    expect(a.client).toBe(b.client)
  })

  it('destroys the stale client when the fingerprint changes', async () => {
    const { getS3StorageContext } = await importS3()
    await getS3StorageContext()
    const assets = TEST_BLOG_SETTINGS_BUNDLE.assets!
    setBundle({
      ...TEST_BLOG_SETTINGS_BUNDLE,
      assets: {
        ...assets,
        storage: { ...assets.storage, bucket: 'other-bucket' },
      },
    })
    await getS3StorageContext()
    expect(destroyMock).toHaveBeenCalled()
  })
})

describe('infra/storage/s3-client — putPublicS3Object', () => {
  it('sends a PutObjectCommand with the default Cache-Control', async () => {
    const { putPublicS3Object } = await importS3()
    sendMock.mockResolvedValue({})
    await putPublicS3Object({ key: 'a.png', body: Buffer.from('x'), contentType: 'image/png' })
    const input = (sendMock.mock.calls[0]![0] as { input: { CacheControl: string } }).input
    expect(input.CacheControl).toContain('public')
  })

  it('honours a custom Cache-Control', async () => {
    const { putPublicS3Object } = await importS3()
    sendMock.mockResolvedValue({})
    await putPublicS3Object({
      key: 'a.png',
      body: Buffer.from('x'),
      contentType: 'image/png',
      cacheControl: 'no-cache',
    })
    const input = (sendMock.mock.calls[0]![0] as { input: { CacheControl: string } }).input
    expect(input.CacheControl).toBe('no-cache')
  })
})

describe('infra/storage/s3-client — putS3Object', () => {
  it('sends with private Cache-Control', async () => {
    const { putS3Object } = await importS3()
    sendMock.mockResolvedValue({})
    await putS3Object('key', Buffer.from('x'), 'image/png')
    const input = (sendMock.mock.calls[0]![0] as { input: { CacheControl: string } }).input
    expect(input.CacheControl).toContain('private')
  })
})

describe('infra/storage/s3-client — listS3Objects', () => {
  it('returns parsed contents and stops pagination when NextContinuationToken is absent', async () => {
    const { listS3Objects } = await importS3()
    sendMock.mockResolvedValue({
      Contents: [
        { Key: 'a', Size: 10, LastModified: new Date('2024-01-01') },
        { Key: 'b', Size: 20, LastModified: new Date('2024-02-01') },
      ],
    })
    const out = await listS3Objects('prefix')
    expect(out).toHaveLength(2)
    expect(out[0]).toMatchObject({ key: 'a', size: 10 })
  })

  it('aborts pagination when exceeding maxKeys', async () => {
    const { listS3Objects } = await importS3()
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
    const out = await listS3Objects('prefix', 3)
    expect(out.length).toBeLessThanOrEqual(5)
  })

  it('skips entries missing key / size / lastModified', async () => {
    const { listS3Objects } = await importS3()
    sendMock.mockResolvedValue({
      Contents: [
        { Key: 'ok', Size: 1, LastModified: new Date('2024-01-01') },
        { Key: undefined, Size: 1, LastModified: new Date('2024-01-01') },
        { Key: 'no-size', LastModified: new Date('2024-01-01') },
      ],
    })
    const out = await listS3Objects('p')
    expect(out).toEqual([{ key: 'ok', size: 1, lastModified: new Date('2024-01-01') }])
  })
})

describe('infra/storage/s3-client — listS3ObjectsPaginated', () => {
  it('returns objects and continuation token', async () => {
    const { listS3ObjectsPaginated } = await importS3()
    sendMock.mockResolvedValue({
      Contents: [{ Key: 'a', Size: 1, LastModified: new Date('2024-01-01') }],
      NextContinuationToken: 'tok2',
    })
    const out = await listS3ObjectsPaginated('p', 10, 'tok1')
    expect(out.objects).toHaveLength(1)
    expect(out.nextContinuationToken).toBe('tok2')
  })
})

describe('infra/storage/s3-client — getS3ObjectBuffer', () => {
  it('throws ActionFailure(404) when Body is undefined', async () => {
    const { getS3ObjectBuffer } = await importS3()
    sendMock.mockResolvedValue({ Body: undefined })
    await expect(getS3ObjectBuffer('key')).rejects.toMatchObject({ status: 404 })
  })

  it('throws ActionFailure(413) when ContentLength exceeds maxSize', async () => {
    const { getS3ObjectBuffer } = await importS3()
    sendMock.mockResolvedValue({ Body: Buffer.from('x'), ContentLength: 100 })
    await expect(getS3ObjectBuffer('key', 10)).rejects.toMatchObject({ status: 413 })
  })

  it('resolves with the concatenated buffer', async () => {
    const { getS3ObjectBuffer } = await importS3()
    const stream = new Readable()
    stream.push(Buffer.from('hello'))
    stream.push(Buffer.from('world'))
    stream.push(null)
    sendMock.mockResolvedValue({ Body: stream, ContentLength: 10 })
    const buf = await getS3ObjectBuffer('key', 100)
    expect(buf.toString()).toBe('helloworld')
  })

  it('rejects when the stream exceeds maxSize', async () => {
    const { getS3ObjectBuffer } = await importS3()
    const stream = new Readable()
    stream.push(Buffer.alloc(50, 'x'))
    stream.push(null)
    sendMock.mockResolvedValue({ Body: stream, ContentLength: undefined })
    await expect(getS3ObjectBuffer('key', 10)).rejects.toMatchObject({ status: 413 })
  })

  it('propagates stream errors', async () => {
    const { getS3ObjectBuffer } = await importS3()
    const stream = new Readable({ read() {} })
    sendMock.mockResolvedValue({ Body: stream, ContentLength: undefined })
    const promise = getS3ObjectBuffer('key', 1000)
    await new Promise((r) => setImmediate(r))
    stream.destroy(new Error('boom'))
    await expect(promise).rejects.toThrow('boom')
  })
})

describe('infra/storage/s3-client — deleteS3Object / deleteS3Objects', () => {
  it('sends a DeleteObjectCommand', async () => {
    const { deleteS3Object } = await importS3()
    sendMock.mockResolvedValue({})
    await deleteS3Object('k')
    expect(sendMock).toHaveBeenCalledTimes(1)
  })

  it('short-circuits when keys is empty', async () => {
    const { deleteS3Objects } = await importS3()
    await deleteS3Objects([])
    expect(sendMock).not.toHaveBeenCalled()
  })

  it('sends a DeleteObjectsCommand for multiple keys', async () => {
    const { deleteS3Objects } = await importS3()
    sendMock.mockResolvedValue({})
    await deleteS3Objects(['a', 'b'])
    expect(sendMock).toHaveBeenCalledTimes(1)
  })
})
