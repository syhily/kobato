import { ReadableStream, TransformStream, WritableStream } from 'node:stream/web'

// `vmThreads` projects give every test file a fresh VM context that does not
// inherit Node's web-stream globals — install them before anything probes
// them (undici's webidl requires the trio at import time).
export function installWebStreamGlobals(): void {
  if (globalThis.ReadableStream === undefined) {
    globalThis.ReadableStream = ReadableStream as unknown as typeof globalThis.ReadableStream
    globalThis.WritableStream = WritableStream as unknown as typeof globalThis.WritableStream
    globalThis.TransformStream = TransformStream as unknown as typeof globalThis.TransformStream
  }
}
