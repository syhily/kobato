const RELOAD_GUARD_KEY = 'chunk-error-reload-attempted-at'
const RELOAD_COOLDOWN_MS = 10_000

type ReloadListener = () => void
const reloadListeners = new Set<ReloadListener>()
let reloadStarted = false

export function subscribeChunkReload(listener: ReloadListener): () => void {
  reloadListeners.add(listener)
  return () => {
    reloadListeners.delete(listener)
  }
}

export function triggerChunkReload(): void {
  if (typeof window === 'undefined') {
    return
  }
  if (reloadStarted) {
    return
  }

  let storage: Storage | null = null
  try {
    storage = window.sessionStorage
  } catch {
    storage = null
  }

  if (storage) {
    const previous = storage.getItem(RELOAD_GUARD_KEY)
    if (previous !== null) {
      const previousMs = Number.parseInt(previous, 10)
      if (Number.isFinite(previousMs) && Date.now() - previousMs < RELOAD_COOLDOWN_MS) {
        return
      }
    }
    try {
      storage.setItem(RELOAD_GUARD_KEY, String(Date.now()))
    } catch {}
  }

  reloadStarted = true
  for (const listener of reloadListeners) {
    try {
      listener()
    } catch {}
  }

  const reload = () => window.location.reload()
  if (typeof window.requestAnimationFrame === 'function') {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(reload)
    })
  } else {
    window.setTimeout(reload, 50)
  }
}
