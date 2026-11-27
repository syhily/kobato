import { unsafeCast } from '@kobato/base/utils/unsafe-cast'
import { isSea } from '@kobato/server/infra/sea/sea'
import fs from 'node:fs'
import { isMainThread } from 'node:worker_threads'

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

export function installSeaVfsRuntimePatches(): void {
  if (installed || !isMainThread || !isSea()) {
    return
  }
  installed = true
  fs.writev = unsafeCast<typeof fs.writev>(createSequentialWritev(fs.write.bind(fs)))
  fs.readv = unsafeCast<typeof fs.readv>(createSequentialReadv(fs.read.bind(fs)))
}
