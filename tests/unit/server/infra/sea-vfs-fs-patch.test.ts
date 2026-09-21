import fs from 'node:fs'
import { describe, expect, it } from 'vitest'

import { createSequentialReadv, createSequentialWritev, installSeaVfsFsPatch } from '@/server/infra/sea-vfs-fs-patch'

// Unit tests for the sequential readv/writev fallbacks that repair the
// missing async VFS handlers under SEA. The end-to-end proof (a real
// WriteStream flushing through the patch inside a useVfs binary) is the
// backup/restore leg of `pnpm run sea:e2e`.

type WriteCall = { fd: number; buffer: Buffer; position: number | null }

function makeWriter(behavior?: (call: WriteCall) => number | NodeJS.ErrnoException) {
  const calls: WriteCall[] = []
  const write = (
    fd: number,
    buffer: NodeJS.ArrayBufferView,
    _offset: number,
    _length: number,
    position: number | null,
    callback: (error: NodeJS.ErrnoException | null, written: number) => void,
  ): void => {
    const call: WriteCall = { fd, buffer: Buffer.from(buffer.buffer, buffer.byteOffset, buffer.byteLength), position }
    calls.push(call)
    const outcome = behavior?.(call) ?? call.buffer.byteLength
    if (typeof outcome === 'number') {
      callback(null, outcome)
    } else {
      callback(outcome, 0)
    }
  }
  return { calls, write }
}

describe('infra/sea-vfs-fs-patch — createSequentialWritev', () => {
  it('writes buffers in order, advancing the position per buffer', () => {
    const { calls, write } = makeWriter()
    const writev = createSequentialWritev(write)
    const buffers = [Buffer.from('ab'), Buffer.from('cde'), Buffer.from('f')]
    let result: { error: unknown; written: number } | undefined
    writev(7, buffers, 100, (error, written) => {
      result = { error, written }
    })
    expect(result).toEqual({ error: null, written: 6 })
    expect(calls.map((c) => c.position)).toEqual([100, 102, 105])
    expect(Buffer.concat(calls.map((c) => c.buffer)).toString()).toBe('abcdef')
  })

  it('passes null positions through (current-offset semantics)', () => {
    const { calls, write } = makeWriter()
    const writev = createSequentialWritev(write)
    let result: { written: number } | undefined
    writev(7, [Buffer.from('xy')], null, (_error, written) => {
      result = { written }
    })
    expect(result?.written).toBe(2)
    expect(calls.map((c) => c.position)).toEqual([null])
  })

  it('supports the callback-as-position overload', () => {
    const { calls, write } = makeWriter()
    const writev = createSequentialWritev(write)
    let result: { written: number } | undefined
    writev(7, [Buffer.from('q')], (_error, written) => {
      result = { written }
    })
    expect(result?.written).toBe(1)
    expect(calls).toHaveLength(1)
  })

  it('stops at a partial write and reports the partial total', () => {
    const { calls, write } = makeWriter((call) => (call.position === 0 ? 1 : call.buffer.byteLength))
    const writev = createSequentialWritev(write)
    const buffers = [Buffer.from('abc'), Buffer.from('def')]
    let result: { error: unknown; written: number } | undefined
    writev(7, buffers, 0, (error, written) => {
      result = { error, written }
    })
    // One byte of the first buffer landed; the second buffer never started —
    // the stream layer retries the remainder itself.
    expect(result).toEqual({ error: null, written: 1 })
    expect(calls).toHaveLength(1)
  })

  it('propagates an error together with the bytes completed so far', () => {
    const failure = Object.assign(new Error('disk full'), { code: 'ENOSPC' })
    const { calls, write } = makeWriter((call) => (call.position === 3 ? failure : call.buffer.byteLength))
    const writev = createSequentialWritev(write)
    let result: { error: unknown; written: number } | undefined
    writev(7, [Buffer.from('abc'), Buffer.from('def')], 0, (error, written) => {
      result = { error, written }
    })
    expect(result?.written).toBe(3)
    expect(result?.error).toBeInstanceOf(Error)
    expect((result?.error as NodeJS.ErrnoException | undefined)?.code).toBe('ENOSPC')
    expect(calls).toHaveLength(2)
  })

  it('completes immediately for an empty buffer list', () => {
    const { calls, write } = makeWriter()
    const writev = createSequentialWritev(write)
    let result: { error: unknown; written: number } | undefined
    writev(7, [], 42, (error, written) => {
      result = { error, written }
    })
    expect(result).toEqual({ error: null, written: 0 })
    expect(calls).toHaveLength(0)
  })
})

describe('infra/sea-vfs-fs-patch — createSequentialReadv', () => {
  it('fills buffers in order, advancing the position per buffer', () => {
    const reads: Array<{ position: number | null }> = []
    const read = (
      _fd: number,
      buffer: NodeJS.ArrayBufferView,
      _offset: number,
      _length: number,
      position: number | null,
      callback: (error: NodeJS.ErrnoException | null, bytesRead: number) => void,
    ): void => {
      reads.push({ position })
      const view = Buffer.from(buffer.buffer, buffer.byteOffset, buffer.byteLength)
      view.fill('x'.charCodeAt(0))
      callback(null, view.byteLength)
    }
    const readv = createSequentialReadv(read)
    let result: { error: unknown; bytesRead: number } | undefined
    readv(9, [Buffer.alloc(2), Buffer.alloc(3)], 50, (error, bytesRead) => {
      result = { error, bytesRead }
    })
    expect(result).toEqual({ error: null, bytesRead: 5 })
    expect(reads.map((r) => r.position)).toEqual([50, 52])
  })

  it('stops at a short read (EOF) and reports the total read so far', () => {
    let calls = 0
    const read = (
      _fd: number,
      buffer: NodeJS.ArrayBufferView,
      _offset: number,
      _length: number,
      _position: number | null,
      callback: (error: NodeJS.ErrnoException | null, bytesRead: number) => void,
    ): void => {
      calls += 1
      callback(null, calls === 1 ? buffer.byteLength : 0)
    }
    const readv = createSequentialReadv(read)
    let result: { bytesRead: number } | undefined
    readv(9, [Buffer.alloc(4), Buffer.alloc(4), Buffer.alloc(4)], null, (_error, bytesRead) => {
      result = { bytesRead }
    })
    expect(result?.bytesRead).toBe(4)
    expect(calls).toBe(2)
  })
})

describe('infra/sea-vfs-fs-patch — installSeaVfsFsPatch', () => {
  it('is a no-op outside a SEA (the originals stay in place)', () => {
    const originalWritev = fs.writev
    const originalReadv = fs.readv
    installSeaVfsFsPatch()
    expect(fs.writev).toBe(originalWritev)
    expect(fs.readv).toBe(originalReadv)
  })
})
