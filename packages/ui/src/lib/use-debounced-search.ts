import { useEffect, useRef, useState } from 'react'

interface UseDebouncedSearchOptions<T> {
  initial?: string
  /** Debounce delay (ms). Defaults to 250 — snappy but tolerates CJK IME bursts. */
  delayMs?: number
  onChange: (value: string) => T | undefined
}

export function useDebouncedSearch<T>({ initial = '', delayMs = 250, onChange }: UseDebouncedSearchOptions<T>) {
  const [value, setValue] = useState(initial)
  const [lastInitial, setLastInitial] = useState(initial)
  // Reset when the external initial value changes (e.g. back/forward updates URL params).
  if (initial !== lastInitial) {
    setLastInitial(initial)
    setValue(initial)
  }

  // `onChange` rides a ref — a fresh closure per render would reset the timer every keystroke.
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
