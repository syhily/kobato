import type { GifProviderConfig } from '@kobato/inkling-internal/services/gif'

import { useDisposableStore } from '@kobato/inkling-internal/hooks/useDisposableStore'
import {
  createGifBrowser,
  type GifBrowser,
  type GifFetchPage,
  type GifScheduler,
} from '@kobato/inkling-internal/services/gif-browser'
import React from 'react'

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
