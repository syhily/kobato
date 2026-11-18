import { useCallback, useEffect, useLayoutEffect, useRef, useState, type Ref, type SyntheticEvent } from 'react'

export interface ImageLoadedHook {
  ref: (node: HTMLImageElement | null) => void
  loaded: boolean
  handleLoad: (event: SyntheticEvent<HTMLImageElement>) => void
}

// Module-level: keeps the ref mutation out of the React compiler's hook-arg immutability check.
function forwardRefValue<T>(ref: Ref<T> | undefined, value: T | null): void {
  if (typeof ref === 'function') {
    ref(value)
  } else if (ref && 'current' in ref) {
    ;(ref as React.RefObject<T | null>).current = value
  }
}

export function useImageLoaded(
  externalRef: Ref<HTMLImageElement> | undefined,
  onLoad?: (event: SyntheticEvent<HTMLImageElement>) => void,
): ImageLoadedHook {
  const imgRef = useRef<HTMLImageElement | null>(null)
  const [node, setNode] = useState<HTMLImageElement | null>(null)
  const [loaded, setLoaded] = useState(false)

  useLayoutEffect(() => {
    if (imgRef.current?.complete) {
      setLoaded(true)
    }
  }, [])

  useEffect(() => {
    forwardRefValue(externalRef, node)
  }, [externalRef, node])

  const ref = useCallback((value: HTMLImageElement | null) => {
    imgRef.current = value
    setNode(value)
    if (value?.complete) {
      setLoaded(true)
    }
  }, [])

  const handleLoad = useCallback(
    (event: SyntheticEvent<HTMLImageElement>) => {
      setLoaded(true)
      onLoad?.(event)
    },
    [onLoad],
  )

  return { ref, loaded, handleLoad }
}
