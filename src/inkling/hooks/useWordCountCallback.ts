import { useWordCountHandleState } from '@/inkling/context/WordCountHandleContext'

// Render-only subscription to the per-composer word-count handle. Returns the
// onChange callback the top-level WordCountPlugin published, or null until it
// mounts; useSyncExternalStore re-renders the subscriber when the callback lands,
// so a nested composer mounts its own WordCountPlugin reactively instead of
// reading a shared ref once at render time.
export function useWordCountCallback(): ((count: number) => void) | null {
  return useWordCountHandleState((state) => state.onChange)
}

// The selection-count channel of the same handle. A selection-only top-level
// plugin publishes this without an onChange, and nested composers mount a
// selection-only WordCountPlugin with it.
export function useWordCountSelectionCallback(): ((count: number | null) => void) | null {
  return useWordCountHandleState((state) => state.onSelectionChange)
}

// The top-level plugin's language, published alongside the callbacks — null until
// the plugin mounts; nested composers pass it to their own WordCountPlugin so
// nested editors count with the same language.
export function useWordCountLanguage(): string | null {
  return useWordCountHandleState((state) => state.language)
}
