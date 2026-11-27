import { useEffect, useRef, useState } from 'react'

interface UseDebouncedSearchOptions<T> {
  initial?: string
  delayMs?: number
  onChange: (value: string) => T | undefined
}

export function useDebouncedSearch<T>({ initial = '', delayMs = 250, onChange }: UseDebouncedSearchOptions<T>) {
  const [value, setValue] = useState(initial)
  const [lastInitial, setLastInitial] = useState(initial)
  if (initial !== lastInitial) {
    setLastInitial(initial)
    setValue(initial)
  }

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
