/* oxlint-disable typescript/no-unsafe-type-assertion */
import type { MusicProvider } from '@/server/domains/music/providers/types'

import { neteaseProvider } from '@/server/domains/music/providers/netease'
import { tencentProvider } from '@/server/domains/music/providers/tencent'

type MetingSource = 'netease' | 'tencent'

const providers = new Map<MetingSource, MusicProvider>([
  ['netease', neteaseProvider],
  ['tencent', tencentProvider],
])

export function getProvider(source: string): MusicProvider {
  const provider = providers.get(source as MetingSource)
  if (!provider) {
    throw new Error(`Unknown music provider: ${source}`)
  }
  return provider
}

export type { MetingSource }
