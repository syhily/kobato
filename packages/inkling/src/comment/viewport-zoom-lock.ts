const LOCKED_VIEWPORT = 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no'

let holders = 0
let lockedMeta: HTMLMetaElement | null = null
let originalContent: string | null = null

export function isIosWebKit(): boolean {
  if (typeof window === 'undefined') {
    return false
  }
  const ua = window.navigator.userAgent
  if (/iPad|iPhone|iPod/.test(ua)) {
    return true
  }
  return ua.includes('Macintosh') && navigator.maxTouchPoints > 1
}

export function acquireViewportZoomLock(): void {
  if (typeof document === 'undefined' || !isIosWebKit()) {
    return
  }
  holders += 1
  if (holders > 1) {
    return
  }
  const meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]')
  if (!meta) {
    return
  }
  lockedMeta = meta
  originalContent = meta.getAttribute('content')
  meta.setAttribute('content', LOCKED_VIEWPORT)
}

export function releaseViewportZoomLock(): void {
  if (holders === 0) {
    return
  }
  holders -= 1
  if (holders > 0) {
    return
  }
  if (lockedMeta !== null && originalContent !== null) {
    lockedMeta.setAttribute('content', originalContent)
  }
  lockedMeta = null
  originalContent = null
}
