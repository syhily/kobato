import { useSyncExternalStore } from 'react'

function subscribe(callback: () => void) {
  const mq = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`)
  const listener = () => callback()
  mq.addEventListener('change', listener)
  return () => mq.removeEventListener('change', listener)
}

function getSnapshot() {
  return window.devicePixelRatio
}

function getServerSnapshot() {
  return 1
}

/**
 * Reactive `window.devicePixelRatio`. Returns `1` during SSR and updates
 * when the user zooms or moves the window to a display with a different DPR.
 */
export function useDevicePixelRatio(): number {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
