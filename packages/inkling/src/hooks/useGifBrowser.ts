import type { GifProviderConfig } from '@kobato/inkling-internal/services/gif'

import { useDisposableStore } from '@kobato/inkling-internal/hooks/useDisposableStore'
import {
  createGifBrowser,
  type GifBrowser,
  type GifFetchPage,
  type GifScheduler,
} from '@kobato/inkling-internal/services/gif-browser'
import { useMemo } from 'react'
interface UseGifBrowserOptions {
  config: GifProviderConfig
  fetchPage?: GifFetchPage
  scheduler?: GifScheduler
  debounceMs?: number
}

export function useGifBrowser({ config, fetchPage, scheduler, debounceMs }: UseGifBrowserOptions): GifBrowser {
  const { provider, apiUrl, apiKey, contentFilter } = config
  const memoConfig = useMemo(
    () => ({ provider, apiUrl, apiKey, contentFilter }),
    [provider, apiUrl, apiKey, contentFilter],
  )
  return useDisposableStore(
    () => createGifBrowser({ config: memoConfig, fetchPage, scheduler, debounceMs }),
    [memoConfig, fetchPage, scheduler, debounceMs],
  )
}
