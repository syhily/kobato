// Runtime repair for an upstream Node.js bug that ships with the SEA VFS
// (`"useVfs": true`, still unfixed as of Node 26.10.0 — pinned by
// `pnpm run sea:probe`):
//
// Async readv/writev: the mounted-VFS handler table
// (`lib/internal/vfs/setup.js`) implements `readvSync`/`writevSync` but NOT
// the async `readv`/`writev`, while the callback `fs.readv`/`fs.writev`
// (`lib/fs.js`) call `h.readv(fd, …)` / `h.writev(fd, …)` unguarded whenever
// any VFS layer is mounted. The result: ANY async `fs.writev` — most
// importantly `WriteStream._writev`, which fires whenever two chunks queue
// on a `fs.createWriteStream` — kills the process with
// `TypeError: h.writev is not a function`, on REAL files outside the mount
// too (observed killing backup/restore mid-extraction).
//
// The repair replaces both entry points on the public `fs` exports with
// sequential single-operation fallbacks. WriteStream/ReadStream resolve
// `this[kFs].writev` per call against that same exports object, so one
// replacement covers every stream created after the patch. Semantics match
// the originals: positional writes advance per buffer, a partial operation
// reports the partial total (the stream layer retries the remainder), an
// error reports the total completed so far, a non-number position means the
// current offset. The promises API (`FileHandle.writev`, `writeFile`)
// bypasses the handler table entirely and needs no repair.
//
// Scope guard: main thread of a real SEA only — worker threads have no VFS
// layer (their handler table is null) and non-SEA runtimes never install
// one, so the originals are fine there.
//
// Retired: this module also re-wrapped `process.dlopen` to stop the VFS
// addon loader from forwarding a missing flags argument as an explicit
// `undefined` (coerced to dlopen mode 0, which glibc rejects). Node 26.10.0
// fixed the forwarding upstream (nodejs/node#65909), so the guard is
// removed; SEA builds gate on Node >= 26.10 (scripts/sea/build.ts).

import fs from 'node:fs'
import { isMainThread } from 'node:worker_threads'

import { isSea } from '@/server/infra/sea'
import { unsafeCast } from '@/shared/utils/unsafe-cast'

type BufferList = readonly NodeJS.ArrayBufferView[]

type WriteLike = (
  fd: number,
  buffer: NodeJS.ArrayBufferView,
  offset: number,
  length: number,
  position: number | null,
  callback: (error: NodeJS.ErrnoException | null, written: number) => void,
) => void

type ReadLike = (
  fd: number,
  buffer: NodeJS.ArrayBufferView,
  offset: number,
  length: number,
  position: number | null,
  callback: (error: NodeJS.ErrnoException | null, bytesRead: number) => void,
) => void

export type WritevLike = {
  (
    fd: number,
    buffers: BufferList,
    callback: (error: NodeJS.ErrnoException | null, bytesWritten: number, buffers: BufferList) => void,
  ): void
  (
    fd: number,
    buffers: BufferList,
    position: number | null,
    callback: (error: NodeJS.ErrnoException | null, bytesWritten: number, buffers: BufferList) => void,
  ): void
}

export type ReadvLike = {
  (
    fd: number,
    buffers: BufferList,
    callback: (error: NodeJS.ErrnoException | null, bytesRead: number, buffers: BufferList) => void,
  ): void
  (
    fd: number,
    buffers: BufferList,
    position: number | null,
    callback: (error: NodeJS.ErrnoException | null, bytesRead: number, buffers: BufferList) => void,
  ): void
}

/** Sequential `fs.writev` built on single `fs.write` calls. Exported for tests. */
export function createSequentialWritev(write: WriteLike): WritevLike {
  return (
    fd: number,
    buffers: BufferList,
    positionOrCallback:
      | number
      | null
      | ((error: NodeJS.ErrnoException | null, bytesWritten: number, buffers: BufferList) => void),
    callbackOrUndefined?: (error: NodeJS.ErrnoException | null, bytesWritten: number, buffers: BufferList) => void,
  ) => {
    // Mirror the original's coercion: any non-number position (undefined
    // included) means the current offset.
    const position = typeof positionOrCallback === 'number' ? positionOrCallback : null
    const callback = typeof positionOrCallback === 'function' ? positionOrCallback : callbackOrUndefined!
    let total = 0
    let index = 0
    const next = (): void => {
      if (index >= buffers.length) {
        callback(null, total, buffers)
        return
      }
      const buffer = buffers[index]
      index += 1
      write(fd, buffer, 0, buffer.byteLength, position === null ? null : position + total, (error, written) => {
        if (error !== null) {
          callback(error, total, buffers)
          return
        }
        total += written
        if (written < buffer.byteLength) {
          callback(null, total, buffers)
          return
        }
        next()
      })
    }
    next()
  }
}

/** Sequential `fs.readv` built on single `fs.read` calls. Exported for tests. */
export function createSequentialReadv(read: ReadLike): ReadvLike {
  return (
    fd: number,
    buffers: BufferList,
    positionOrCallback:
      | number
      | null
      | ((error: NodeJS.ErrnoException | null, bytesRead: number, buffers: BufferList) => void),
    callbackOrUndefined?: (error: NodeJS.ErrnoException | null, bytesRead: number, buffers: BufferList) => void,
  ) => {
    const position = typeof positionOrCallback === 'number' ? positionOrCallback : null
    const callback = typeof positionOrCallback === 'function' ? positionOrCallback : callbackOrUndefined!
    let total = 0
    let index = 0
    const next = (): void => {
      if (index >= buffers.length) {
        callback(null, total, buffers)
        return
      }
      const buffer = buffers[index]
      index += 1
      read(fd, buffer, 0, buffer.byteLength, position === null ? null : position + total, (error, bytesRead) => {
        if (error !== null) {
          callback(error, total, buffers)
          return
        }
        total += bytesRead
        if (bytesRead < buffer.byteLength) {
          callback(null, total, buffers)
          return
        }
        next()
      })
    }
    next()
  }
}

let installed = false

/** Replace the broken async `fs.readv`/`fs.writev` under a SEA VFS mount. Idempotent. */
export function installSeaVfsRuntimePatches(): void {
  if (installed || !isMainThread || !isSea()) {
    return
  }
  installed = true
  // The factories cover the optional-position overloads; typeof fs.writev /
  // fs.readv additionally carry the promisify custom symbols, which the
  // sequential fallbacks intentionally do not reproduce.
  fs.writev = unsafeCast<typeof fs.writev>(createSequentialWritev(fs.write.bind(fs)))
  fs.readv = unsafeCast<typeof fs.readv>(createSequentialReadv(fs.read.bind(fs)))
}
