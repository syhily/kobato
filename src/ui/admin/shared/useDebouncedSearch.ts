import { useEffect, useState } from 'react'

interface UseDebouncedSearchOptions<T> {
  /** Initial input value. Defaults to `''`. */
  initial?: string
  /** Debounce delay (ms). Defaults to 250 — snappy but tolerates CJK IME bursts. */
  delayMs?: number
  /** Fired on the trailing edge of the debounce window. Closes over the
   *  latest value via the React effect, so the callee can call into a
   *  fetcher safely. */
  onChange: (value: string) => T | void
}

/**
 * Two-state debounced text input helper. Returns the immediately-bound
 * input value (for the controlled `<input>`) plus a setter, and fires
 * `onChange(value)` after `delayMs` of inactivity.
 *
 * Replaces the four ad-hoc `setTimeout` debounces previously inlined in
 * the admin views (CommentsView's `pageQuery`/`authorQuery`, UsersView's
 * search input).
 */
export function useDebouncedSearch<T>({ initial = '', delayMs = 250, onChange }: UseDebouncedSearchOptions<T>) {
  const [value, setValue] = useState(initial)
  const [lastInitial, setLastInitial] = useState(initial)
  // Reset internal value when the external initial value changes (e.g.
  // browser back/forward updates URL search params).
  if (initial !== lastInitial) {
    setLastInitial(initial)
    setValue(initial)
  }

  useEffect(() => {
    const handle = window.setTimeout(() => {
      void onChange(value)
    }, delayMs)
    return () => window.clearTimeout(handle)
    // `onChange` is intentionally omitted from deps: callers usually
    // pass a fresh closure on every render, and adding it would make
    // the timer reset on every keystroke and never fire.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, delayMs])

  return [value, setValue] as const
}
