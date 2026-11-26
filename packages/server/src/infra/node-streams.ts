import type { Readable } from 'node:stream'

export function nodeStreamToWeb(stream: Readable): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      stream.on('data', (chunk: Buffer) => {
        controller.enqueue(new Uint8Array(chunk))
      })
      stream.on('end', () => controller.close())
      stream.on('error', (error) => controller.error(error))
    },
    cancel() {
      stream.destroy()
    },
  })
}
