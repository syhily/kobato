// Experimental Network Information API — not part of lib.dom.
interface NetworkInformationLike {
  readonly saveData?: boolean
  readonly effectiveType?: string
}

/**
 * Idle-time prefetcher for tier-2 route chunks.
 *
 * Inserts `<link rel="modulepreload">` tags in batches during browser idle
 * time so navigating to a non-critical route is instant. Skips on metered or
 * very slow connections. Link nodes are removed 5s after the final batch so
 * they don't linger once the modules are cached.
 *
 * This source is bundled + minified at build time by `routeWarmupPlugin`; the
 * chunk list is injected per request by `RouteWarmupScript` via the
 * `CHUNKS_SENTINEL` placeholder. Keep this module free of top-level side
 * effects so it is safe to import for the sentinel constant.
 */
export function startRouteWarmup(chunks: string[]): void {
  const connection = (navigator as Navigator & { connection?: NetworkInformationLike }).connection
  // Respect data-saver and avoid prefetch on 2G networks.
  if (connection?.saveData) {
    return
  }
  if (connection?.effectiveType === '2g') {
    return
  }

  const batchSize = 5
  const links: HTMLLinkElement[] = []
  let cursor = 0

  const run = (): void => {
    const end = Math.min(cursor + batchSize, chunks.length)
    for (; cursor < end; cursor++) {
      const link = document.createElement('link')
      link.rel = 'modulepreload'
      link.href = chunks[cursor]
      document.head.appendChild(link)
      links.push(link)
    }

    if (cursor < chunks.length) {
      scheduleNext()
    } else {
      // Drop the now-redundant link nodes once the modules are cached.
      setTimeout(() => {
        for (const link of links) {
          link.remove()
        }
      }, 5000)
    }
  }

  const scheduleNext = (): void => {
    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(run, { timeout: 2000 })
    } else {
      setTimeout(run, 100)
    }
  }

  if (document.visibilityState === 'visible') {
    setTimeout(run, 2000)
  } else {
    const onVisible = (): void => {
      if (document.visibilityState === 'visible') {
        document.removeEventListener('visibilitychange', onVisible)
        setTimeout(run, 1000)
      }
    }
    document.addEventListener('visibilitychange', onVisible)
  }
}
