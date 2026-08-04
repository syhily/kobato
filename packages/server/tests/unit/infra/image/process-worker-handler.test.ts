import { Buffer } from 'node:buffer'
import { EventEmitter } from 'node:events'
import { beforeEach, describe, expect, it, vi } from 'vitest'

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
}) {
  const meta = { width: opts.width, height: opts.height }
  const staged: SharpInstance = {
    rotate: () => staged,
    clone: () => staged,
    resize: () => staged,
    jpeg: () => ({ toBuffer: async () => opts.buffer ?? Buffer.from([0xff, 0xd8, 0xff, 0xd9]) }),
    metadata: async () => meta,
    ensureAlpha: () => staged,
    raw: () => ({
      toBuffer: async () => ({
        data: opts.rgba?.data ?? Buffer.alloc(4),
        info: { width: opts.rgba?.width ?? 1, height: opts.rgba?.height ?? 1 },
      }),
    }),
  }
  return () => staged
}

// The worker statically imports sharp, so the mock targets the package.
const sharpMock = vi.hoisted(() => {
  let current: (() => unknown) | null = null
  const fn = Object.assign(
    () => {
      if (current === null) {
        throw new Error('not configured')
      }
      return current()
    },
    {
      __setMock(next: () => unknown) {
        current = next
      },
    },
  )
  return { fn }
})

vi.mock('sharp', () => ({ default: sharpMock.fn }))

vi.mock('@kobato/shared/utils/thumbhash', () => ({
  rgbaToThumbHash: () => new Uint8Array([0, 1, 2, 3]),
}))

const port = new EventEmitter()
const postMessage = vi.fn()

vi.mock('node:worker_threads', () => ({
  parentPort: Object.assign(port, { postMessage }),
  workerData: { initialized: true },
}))

async function importWorker() {
  vi.resetModules()
  await import('@kobato/server/infra/image/process-worker')
}

beforeEach(() => {
  postMessage.mockReset()
  port.removeAllListeners()
})

describe('infra/image/process-worker — worker message handler', () => {
  it('posts an ok response for a valid process request', async () => {
    sharpMock.fn.__setMock(
      mockSharp({
        width: 100,
        height: 100,
        buffer: Buffer.from([0xff]),
        rgba: { data: Buffer.alloc(400), width: 10, height: 10 },
      }),
    )
    await importWorker()
    port.emit('message', { type: 'process', id: 7, input: { buffer: Buffer.from('img'), jpegQuality: 80 } })
    await new Promise((r) => setImmediate(r))
    expect(postMessage).toHaveBeenCalledTimes(1)
    const response = postMessage.mock.calls[0]![0]
    expect(response).toMatchObject({ type: 'process:result', id: 7, ok: true })
  })

  it('posts an error response when the input is invalid', async () => {
    sharpMock.fn.__setMock(mockSharp({ width: 0, height: 0 }))
    await importWorker()
    port.emit('message', { type: 'process', id: 9, input: { buffer: Buffer.from('bad'), jpegQuality: 80 } })
    await new Promise((r) => setImmediate(r))
    expect(postMessage).toHaveBeenCalledTimes(1)
    const response = postMessage.mock.calls[0]![0]
    expect(response.ok).toBe(false)
    expect(response.error.code).toBe('BAD_REQUEST')
  })

  it('ignores messages without type: process', async () => {
    await importWorker()
    port.emit('message', { type: 'other', id: 1 })
    await new Promise((r) => setImmediate(r))
    expect(postMessage).not.toHaveBeenCalled()
  })

  it('ignores malformed messages', async () => {
    await importWorker()
    port.emit('message', null)
    port.emit('message', {})
    await new Promise((r) => setImmediate(r))
    expect(postMessage).not.toHaveBeenCalled()
  })
})
