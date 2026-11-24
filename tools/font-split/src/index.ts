import type { FontSplitOptions, FontSplitOutputFile } from '@kobato/font-split/binding'

import { createRequire } from 'node:module'
import { join } from 'node:path'

type NativeBinding = typeof import('@kobato/font-split/binding')

let cached: NativeBinding | null = null

export function loadNativeBinding(): NativeBinding {
  if (cached !== null) {
    return cached
  }
  const nodeRequire = createRequire(import.meta.url)
  const addonPath = join(import.meta.dirname, '..', 'font-split.node')
  try {
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the .node addon is untyped at runtime
    cached = nodeRequire(addonPath) as NativeBinding
  } catch (error) {
    throw new Error(
      '@kobato/font-split native addon is not built — run `pnpm --filter @kobato/font-split run build` first',
      { cause: error },
    )
  }
  return cached
}

export function fontSplitAlgorithmVersion(): string {
  return loadNativeBinding().fontSplitAlgorithmVersion()
}

export async function fontSplit(input: Buffer, options?: FontSplitOptions | null): Promise<FontSplitOutputFile[]> {
  return loadNativeBinding().fontSplit(input, options)
}
