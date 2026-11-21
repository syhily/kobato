import { fontSplit, type FontSplitOutputFile } from '@kobato/server/domains/fonts/vendor/wasm-split'
import { getLogger } from '@kobato/server/infra/logger'

const log = getLogger('fonts.slice')

export interface SliceOptions {
  fontFamily?: string
}

export interface SliceResult {
  css: Uint8Array
  chunks: FontSplitOutputFile[]
  chunkCount: number
  totalBytes: number
}

export async function sliceFont(sourceBuffer: Uint8Array, options: SliceOptions = {}): Promise<SliceResult> {
  const outputs = await fontSplit({
    input: sourceBuffer,
    css: options.fontFamily ? { fontFamily: options.fontFamily } : {},
    reporter: false,
  })

  log.info('fontSplit returned', { outputCount: outputs.length, names: outputs.map((f) => f.name) })

  const css = findOutput(outputs, 'result.css')
  if (!css) {
    throw new Error('cn-font-split did not emit result.css — the JS↔wasm contract may have drifted')
  }
  const chunks = outputs.filter(isWoff2File)

  let totalBytes = css.data.length
  for (const c of chunks) {
    totalBytes += c.data.length
  }

  return { css: css.data, chunks, chunkCount: chunks.length, totalBytes }
}

function findOutput(outputs: FontSplitOutputFile[], name: string): FontSplitOutputFile | undefined {
  return outputs.find((f) => f.name === name)
}

function isWoff2File(f: FontSplitOutputFile): boolean {
  return f.name.endsWith('.woff2')
}
