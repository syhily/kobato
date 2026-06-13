import { Buffer } from 'node:buffer'
import { describe, expect, it, vi } from 'vitest'

type SharpInstance = {
  rotate: () => SharpInstance
  clone: () => SharpInstance
  resize: (opts: unknown) => SharpInstance
  jpeg: (opts: unknown) => { toBuffer: () => Promise<Buffer> }
  metadata: () => Promise<{ width?: number; height?: number }>
  ensureAlpha: () => SharpInstance
  raw: () => { toBuffer: (opts: unknown) => Promise<{ data: Buffer; info: { width: number; height: number } }> }
}

function mockSharp(opts: {
  width?: number
  height?: number
  buffer?: Buffer
  rgba?: { data: Buffer; width: number; height: number }
  throwOnConstruct?: boolean
  throwOnResize?: boolean
  throwOnEncode?: boolean
}) {
  const meta = { width: opts.width, height: opts.height }
  const staged: SharpInstance = {
    rotate: () => staged,
    clone: () => staged,
    resize: () => {
      if (opts.throwOnResize) {
        throw new Error('resize fail')
      }
      return staged
    },
    jpeg: () => ({
      toBuffer: async () => {
        if (opts.throwOnEncode) {
          throw new Error('encode fail')
        }
        return opts.buffer ?? Buffer.from([0xff, 0xd8, 0xff, 0xd9])
      },
    }),
    metadata: async () => meta,
    ensureAlpha: () => staged,
    raw: () => ({
      toBuffer: async () => ({
        data: opts.rgba?.data ?? Buffer.alloc(4),
        info: { width: opts.rgba?.width ?? 1, height: opts.rgba?.height ?? 1 },
      }),
    }),
  }
  return (input: unknown) => {
    if (opts.throwOnConstruct) {
      throw new Error('construct fail')
    }
    return staged
  }
}

vi.mock('sharp', () => {
  let current: ((input: unknown) => SharpInstance) | null = null
  return {
    default: Object.assign(
      (input: unknown) => {
        if (current === null) {
          throw new Error('sharp mock not configured')
        }
        return current(input)
      },
      {
        __setMock(fn: (input: unknown) => SharpInstance) {
          current = fn
        },
      },
    ),
  }
})

vi.mock('@/shared/utils/thumbhash', () => ({
  rgbaToThumbHash: () => new Uint8Array([0, 1, 2, 3]),
}))

import { processImageInWorker, WorkerDomainError, type ProcessImageInput } from '@/server/infra/image/process-worker'

async function run(input: Partial<ProcessImageInput> = {}) {
  return processImageInWorker({
    buffer: Buffer.from('img'),
    jpegQuality: 80,
    ...input,
  })
}

describe('infra/image/process-worker — processImageInWorker', () => {
  it('processes a valid image and returns metadata + thumbhash', async () => {
    const sharp = (await import('sharp')).default as unknown as {
      __setMock(fn: (input: unknown) => SharpInstance): void
    }
    sharp.__setMock(
      mockSharp({
        width: 128,
        height: 96,
        buffer: Buffer.from([0xff, 0xd8, 0xff]),
        rgba: { data: Buffer.alloc(4 * 128 * 96), width: 128, height: 96 },
      }),
    )
    const result = await run()
    expect(result.width).toBe(128)
    expect(result.height).toBe(96)
    expect(result.byteSize).toBe(result.buffer.byteLength)
    expect(typeof result.thumbhash).toBe('string')
  })

  it('applies resize options when provided', async () => {
    const sharp = (await import('sharp')).default as unknown as {
      __setMock(fn: (input: unknown) => SharpInstance): void
    }
    sharp.__setMock(
      mockSharp({
        width: 100,
        height: 100,
        buffer: Buffer.from([0xff]),
        rgba: { data: Buffer.alloc(400), width: 10, height: 10 },
      }),
    )
    const result = await run({ resize: { width: 50, height: 50 } })
    expect(result.width).toBe(100)
  })

  it('throws WorkerDomainError when sharp construction fails', async () => {
    const sharp = (await import('sharp')).default as unknown as {
      __setMock(fn: (input: unknown) => SharpInstance): void
    }
    sharp.__setMock(mockSharp({ throwOnConstruct: true }))
    await expect(run()).rejects.toBeInstanceOf(WorkerDomainError)
  })

  it('throws WorkerDomainError when encode fails', async () => {
    const sharp = (await import('sharp')).default as unknown as {
      __setMock(fn: (input: unknown) => SharpInstance): void
    }
    sharp.__setMock(mockSharp({ width: 100, height: 100, throwOnEncode: true }))
    await expect(run()).rejects.toBeInstanceOf(WorkerDomainError)
  })

  it('throws WorkerDomainError when dimensions are invalid', async () => {
    const sharp = (await import('sharp')).default as unknown as {
      __setMock(fn: (input: unknown) => SharpInstance): void
    }
    sharp.__setMock(mockSharp({ width: 0, height: 0 }))
    await expect(run()).rejects.toBeInstanceOf(WorkerDomainError)
  })

  it('WorkerDomainError serialises code / message / issues', () => {
    const err = new WorkerDomainError('BAD_REQUEST', 'boom', [{ message: 'x' }])
    expect(err.code).toBe('BAD_REQUEST')
    expect(err.message).toBe('boom')
    expect(err.issues).toEqual([{ message: 'x' }])
    expect(err.name).toBe('DomainError')
  })
})
