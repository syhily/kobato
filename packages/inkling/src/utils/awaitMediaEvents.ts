/**
 * The one media-load wait (round 3, C6): every metadata loader
 * (`getImageDimensions`, `getAudioMetadata`, `extractVideoMetadata`) is a
 * thin config over this primitive — collect the element's success events,
 * fail on `error` or a bounded timeout, and clean all of it up on settle.
 * `start` runs after the listeners attach so the load (assigning `src`,
 * calling `.load()`) can never race ahead of them, and listing several
 * events covers loads whose signals can arrive in one task (a local blob's
 * `loadedmetadata` + `canplay`).
 */

export const MEDIA_LOAD_TIMEOUT_MS = 15_000

export interface AwaitMediaEventsOptions {
  /** Element events the wait collects; resolves once each has fired. */
  events: string[]
  /** Message of the Error the wait rejects with on the element's `error` event. */
  errorMessage: string
  /** Starts the load after the listeners attach — assign `src`, call `.load()` here. */
  start?: () => void
  /** Bounded wait in ms before the wait rejects on its own; defaults to MEDIA_LOAD_TIMEOUT_MS. */
  timeoutMs?: number
}

export function awaitMediaEvents(element: EventTarget, options: AwaitMediaEventsOptions): Promise<void> {
  const { events, errorMessage, start, timeoutMs = MEDIA_LOAD_TIMEOUT_MS } = options

  return new Promise((resolve, reject) => {
    const pending = new Set(events)

    const cleanup = () => {
      clearTimeout(timer)
      for (const event of events) {
        element.removeEventListener(event, onEvent)
      }
      element.removeEventListener('error', onError)
    }

    const onEvent = (event: Event) => {
      pending.delete(event.type)
      if (pending.size === 0) {
        cleanup()
        resolve()
      }
    }

    const onError = () => {
      cleanup()
      reject(new Error(errorMessage))
    }

    const timer = setTimeout(() => {
      cleanup()
      reject(new Error(`${errorMessage} (timed out after ${timeoutMs} ms)`))
    }, timeoutMs)

    for (const event of events) {
      element.addEventListener(event, onEvent)
    }
    element.addEventListener('error', onError)

    start?.()
  })
}
