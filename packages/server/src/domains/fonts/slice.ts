import { getLogger } from '@kobato/server/infra/logger'

import { fontSplit, type FontSplitOutputFile } from './vendor/wasm-split'

const log = getLogger('fonts.slice')

// Slicing integration: a thin wrapper around the vendored cn-font-split wasm
// core (driven by `node:wasi`, see `vendor/wasm-split.ts`). The caller
// (`upload.ts`) owns the source buffer + the storage lifecycle; this module
// owns only the slice options + the output-file partitioning (result.css vs
// chunks).
//
// The wasm core runs single-threaded via WASI (~15–20s for a CJK font, ~1s
// for Latin). It reads the source bytes + writes `result.css` + chunks into
// an OS temp directory, which `fontSplit` returns as `{ name, data }[]`.

// Let the cn-font-split wasm core decide chunk boundaries and character-set
// partitioning freely. No manual chunkSize / languageAreas / subsets —
// removing all overrides lets the core use its internal defaults, producing
// smaller per-chunk packages that load progressively.
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
