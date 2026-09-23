// Runtime repairs for two upstream Node.js bugs that ship with the SEA VFS
// (`"useVfs": true`, Node 26.9.0 — both still unfixed on nodejs/node main as
// of 2026-09-21):
//
// 1. Async readv/writev: the mounted-VFS handler table
//    (`lib/internal/vfs/setup.js`) implements `readvSync`/`writevSync` but
//    NOT the async `readv`/`writev`, while the callback `fs.readv`/`fs.writev`
//    (`lib/fs.js`) call `h.readv(fd, …)` / `h.writev(fd, …)` unguarded
//    whenever any VFS layer is mounted. The result: ANY async `fs.writev` —
//    most importantly `WriteStream._writev`, which fires whenever two chunks
//    queue on a `fs.createWriteStream` — kills the process with
//    `TypeError: h.writev is not a function`, on REAL files outside the
//    mount too (observed killing backup/restore mid-extraction).
//
//    The repair replaces both entry points on the public `fs` exports with
//    sequential single-operation fallbacks. WriteStream/ReadStream resolve
//    `this[kFs].writev` per call against that same exports object, so one
//    replacement covers every stream created after the patch. Semantics
//    match the originals: positional writes advance per buffer, a partial
//    operation reports the partial total (the stream layer retries the
//    remainder), an error reports the total completed so far, a non-number
//    position means the current offset. The promises API
//    (`FileHandle.writev`, `writeFile`) bypasses the handler table entirely
//    and needs no repair.
//
// 2. dlopen flags: the VFS addon loader (`installAddonLoader` in
//    `lib/internal/vfs/setup.js`) wraps `process.dlopen` as
//    `function (module, filename, flags)` and ALWAYS forwards three
//    arguments to the captured original — so a caller that passes no flags
//    (the CJS `.node` extension handler) arrives as an explicit `undefined`.
//    The C++ binding (`DLOpenImpl`, `src/node_binding.cc`) only applies its
//    `DLib::kDefaultFlags` (RTLD_LAZY) default when the argument is ABSENT;
//    an explicit `undefined` coerces through `Int32Value` to 0, and glibc's
//    dlopen rejects mode 0 outright: `invalid mode for dlopen(): Invalid
//    argument` (ERR_DLOPEN_FAILED). EVERY main-thread native addon load of a
//    linux SEA fails this way (sharp, skia, duckdb — real extracted files
//    included). darwin's dyld tolerates mode 0 and worker threads never
//    register a VFS layer, which is why only the linux CI smoke surfaced it.
//
//    The repair re-wraps `process.dlopen`, substituting Node's own default
//    when flags is missing so the VFS wrapper forwards a valid mode. The
//    VFS-resident branch is unaffected either way: `dlopenBinary` treats an
//    undefined flags as "use the default", and RTLD_LAZY IS that default.
//
// Scope guard: main thread of a real SEA only — worker threads have no VFS
// layer (their handler table is null and `process.dlopen` stays the raw
// binding) and non-SEA runtimes never install one, so the originals are
// fine there.

import fs from 'node:fs'
import { constants as osConstants } from 'node:os'
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

type DlopenLike = (module: object, filename: string, flags?: number) => void

/**
 * Node's own default when the caller passes no flags — mirrors
 * `DLib::kDefaultFlags` (`src/node_binding.h`): RTLD_LAZY on POSIX; unused on
 * Windows (the win32 `DLib::Open` goes through `uv_dlopen`, which takes none).
 */
const DEFAULT_DLOPEN_FLAGS = process.platform === 'win32' ? 0 : (osConstants.dlopen?.RTLD_LAZY ?? 1)

/**
 * `process.dlopen` wrapper that replaces a missing flags argument with Node's
 * own default, so the VFS addon loader can no longer forward an explicit
 * `undefined` into the C++ binding (where it coerces to mode 0 and glibc
 * rejects it). Explicit flags pass through untouched. Exported for tests.
 */
export function createDlopenFlagsGuard(dlopen: DlopenLike): DlopenLike {
  return (module, filename, flags) => {
    dlopen(module, filename, flags === undefined ? DEFAULT_DLOPEN_FLAGS : flags)
  }
}

/** Replace the broken async `fs.readv`/`fs.writev` and guard `process.dlopen` under a SEA VFS mount. Idempotent. */
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
  // Capture the current (VFS-installed) dlopen BEFORE overwriting it — the
  // guard must call the captured one, never the live export (itself by then).
  const innerDlopen = unsafeCast<DlopenLike>(process.dlopen.bind(process))
  process.dlopen = unsafeCast<typeof process.dlopen>(createDlopenFlagsGuard(innerDlopen))
}
