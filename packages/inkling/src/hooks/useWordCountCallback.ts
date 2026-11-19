import { useWordCountHandleState } from '@kobato/inkling-internal/context/WordCountHandleContext'

export function useWordCountCallback(): ((count: number) => void) | null {
  return useWordCountHandleState((state) => state.onChange)
}

export function useWordCountSelectionCallback(): ((count: number | null) => void) | null {
  return useWordCountHandleState((state) => state.onSelectionChange)
}
export function useWordCountLanguage(): string | null {
  return useWordCountHandleState((state) => state.language)
}
