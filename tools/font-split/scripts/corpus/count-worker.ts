import { opencc } from '@kobato/font-split/scripts/corpus/convert'
import { processPages, type BatchMessage, type WireResult } from '@kobato/font-split/scripts/corpus/count-core'
import { parentPort } from 'node:worker_threads'

const { hans, hant } = opencc()
const converters = {
  hans: (text: string): string => hans.convert(text),
  hant: (text: string): string => hant.convert(text),
}
const port = parentPort!
port.on('message', (message: BatchMessage) => {
  const pages = message.pages.map((page) => ({ ...page, bytes: new Uint8Array(page.bytes) }))
  const { hans: hansCounts, hant: hantCounts, ...rest } = processPages(pages, converters)
  const result: WireResult = { ...rest, hans: Uint32Array.from(hansCounts), hant: Uint32Array.from(hantCounts) }
  port.postMessage(result, [result.hans.buffer, result.hant.buffer])
})
