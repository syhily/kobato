interface NetworkInformationLike {
  readonly saveData?: boolean
  readonly effectiveType?: string
}

export function startRouteWarmup(chunks: string[]): void {
  const connection = (navigator as Navigator & { connection?: NetworkInformationLike }).connection
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
