import { useEffect, useRef, useState } from 'react'

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
 * `onChange(value)` after `delayMs` of inactivity. Replaces the ad-hoc
 * `setTimeout` debounces previously inlined in the admin views.
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

  // `onChange` rides a ref: callers usually pass a fresh closure every
  // render, and depending on it would reset the debounce timer on every
  // keystroke so it never fires.
  const onChangeRef = useRef(onChange)
  useEffect(() => {
    onChangeRef.current = onChange
  })

  useEffect(() => {
    const handle = window.setTimeout(() => {
      void onChangeRef.current(value)
    }, delayMs)
    return () => window.clearTimeout(handle)
  }, [value, delayMs])

  return [value, setValue] as const
}
