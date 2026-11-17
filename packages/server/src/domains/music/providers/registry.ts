import type { MusicProvider } from '@kobato/server/domains/music/providers/types.ts'

import { neteaseProvider } from '@kobato/server/domains/music/providers/netease.ts'
import { tencentProvider } from '@kobato/server/domains/music/providers/tencent.ts'
import { unsafeCast } from '@kobato/utils/unsafe-cast.ts'

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
