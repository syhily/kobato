import {
  FontSplitRejectedError,
  fontSplit,
  type FontSplitOutputFile,
} from '@kobato/server/domains/fonts/vendor/napi-split'
import { descriptorFor } from '@kobato/server/infra/http/error-descriptor'
import { DomainError } from '@kobato/server/infra/http/errors'
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
  const outputs = await split(sourceBuffer, options)

  log.info('fontSplit returned', { outputCount: outputs.length, names: outputs.map((f) => f.name) })

  const css = findOutput(outputs, 'result.css')
  if (!css) {
    throw new Error('font-split did not emit result.css — the JS↔napi contract may have drifted')
  }
  const chunks = outputs.filter(isWoff2File)

  let totalBytes = css.data.length
  for (const c of chunks) {
    totalBytes += c.data.length
  }

  return { css: css.data, chunks, chunkCount: chunks.length, totalBytes }
}

async function split(sourceBuffer: Uint8Array, options: SliceOptions): Promise<FontSplitOutputFile[]> {
  try {
    return await fontSplit({
      input: sourceBuffer,
      css: { commentBase: false, ...(options.fontFamily ? { fontFamily: options.fontFamily } : {}) },
    })
  } catch (error) {
    if (!(error instanceof FontSplitRejectedError)) {
      throw error
    }
    log.warn('fontSplit rejected the font', { reason: rejectionReason(error.cause) })
    throw new DomainError('BAD_REQUEST', descriptorFor('fonts.error.unreadable'))
  }
}

function rejectionReason(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause)
}

function findOutput(outputs: FontSplitOutputFile[], name: string): FontSplitOutputFile | undefined {
  return outputs.find((f) => f.name === name)
}

function isWoff2File(f: FontSplitOutputFile): boolean {
  return f.name.endsWith('.woff2')
}
