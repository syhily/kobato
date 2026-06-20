import type { MusicProvider } from '@/server/domains/music/providers/types'

import { neteaseProvider } from '@/server/domains/music/providers/netease'
import { tencentProvider } from '@/server/domains/music/providers/tencent'
import { unsafeCast } from '@/shared/utils/unsafe-cast'

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
