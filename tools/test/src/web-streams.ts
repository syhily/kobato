import { ReadableStream, TransformStream, WritableStream } from 'node:stream/web'

export function installWebStreamGlobals(): void {
  if (globalThis.ReadableStream === undefined) {
    globalThis.ReadableStream = ReadableStream as unknown as typeof globalThis.ReadableStream
    globalThis.WritableStream = WritableStream as unknown as typeof globalThis.WritableStream
    globalThis.TransformStream = TransformStream as unknown as typeof globalThis.TransformStream
  }
}
