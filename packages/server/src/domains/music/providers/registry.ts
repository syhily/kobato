import { unsafeCast } from '@kobato/shared/utils/unsafe-cast.ts'

import type { MusicProvider } from './types'

import { neteaseProvider } from './netease'
import { tencentProvider } from './tencent'

type MetingSource = 'netease' | 'tencent'

const providers = new Map<MetingSource, MusicProvider>([
  ['netease', neteaseProvider],
  ['tencent', tencentProvider],
])

export function getProvider(source: string): MusicProvider {
  const provider = providers.get(unsafeCast<MetingSource>(source))
  if (!provider) {
    throw new Error(`Unknown music provider: ${source}`)
  }
  return provider
}

export type { MetingSource }
