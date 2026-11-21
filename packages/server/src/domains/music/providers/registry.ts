import type { MetingSource } from '@kobato/contracts/music'
import type { MusicProvider } from '@kobato/server/domains/music/providers/types'

import { neteaseProvider } from '@kobato/server/domains/music/providers/netease'
import { tencentProvider } from '@kobato/server/domains/music/providers/tencent'
import { unsafeCast } from '@kobato/utils/unsafe-cast'

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

export function __setProviderForTests(source: MetingSource, provider: MusicProvider | null): void {
  providers.set(source, provider ?? (source === 'netease' ? neteaseProvider : tencentProvider))
}
