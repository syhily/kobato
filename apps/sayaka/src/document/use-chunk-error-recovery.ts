import { isChunkLoadError } from '@kobato/ui/lib/chunk-error'
import { triggerChunkReload } from '@kobato/ui/lib/chunk-reload'
import { useEffect } from 'react'

export function useChunkErrorRecovery(): void {
  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    const onError = (event: ErrorEvent) => {
      const payload: unknown = event.error ?? event.message
      if (!isChunkLoadError(payload)) {
        return
      }
      event.preventDefault()
      triggerReload()
    }

    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      if (!isChunkLoadError(event.reason)) {
        return
      }
      event.preventDefault()
      triggerReload()
    }

    window.addEventListener('error', onError)
    window.addEventListener('unhandledrejection', onUnhandledRejection)
    return () => {
      window.removeEventListener('error', onError)
      window.removeEventListener('unhandledrejection', onUnhandledRejection)
    }
  }, [])
}

function triggerReload() {
  triggerChunkReload()
}

export function useReloadOnChunkError(error: unknown): void {
  useEffect(() => {
    if (isChunkLoadError(error)) {
      triggerChunkReload()
    }
  }, [error])
}
