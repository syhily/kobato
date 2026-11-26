export const RESOURCE_STREAM_HEADER = 'x-kobato-resource-stream'

export interface KobatoResourceStream {
  status: number
  headers: Headers
  body: ReadableStream<Uint8Array>
}

export function resourceStreamKey(path: readonly string[]): string {
  return path.join('.')
}
