import React from 'react'

import type { GifProviderConfig } from '@/utils/services/gif'

import { useDisposableStore } from '@/hooks/useDisposableStore'
import { createGifBrowser, type GifBrowser, type GifFetchPage, type GifScheduler } from '@/utils/services/gif-browser'

// React adapter over @/utils/services/gif-browser (the deep module — fetch
// tracks, column balancing, and the navigation machine live there). The
// browser is recreated when the provider config fields or the injected ports
// change; callers re-resolve the config object per render, so the memo keys
// on its fields rather than its identity.

interface UseGifBrowserOptions {
  config: GifProviderConfig
  fetchPage?: GifFetchPage
  scheduler?: GifScheduler
  debounceMs?: number
}

export function useGifBrowser({ config, fetchPage, scheduler, debounceMs }: UseGifBrowserOptions): GifBrowser {
  // callers re-resolve the config object per render; rekey it on its fields
  // (the config's full field set — the real inputs) so the browser only
  // recreates when one of them changes
  const { provider, apiUrl, apiKey, contentFilter } = config
  const memoConfig = React.useMemo(
    () => ({ provider, apiUrl, apiKey, contentFilter }),
    [provider, apiUrl, apiKey, contentFilter],
  )
  return useDisposableStore(
    () => createGifBrowser({ config: memoConfig, fetchPage, scheduler, debounceMs }),
    [memoConfig, fetchPage, scheduler, debounceMs],
  )
}
