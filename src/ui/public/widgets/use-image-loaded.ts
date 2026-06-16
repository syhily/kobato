import { useCallback, useEffect, useLayoutEffect, useRef, useState, type Ref, type SyntheticEvent } from 'react'

export interface ImageLoadedHook {
  ref: (node: HTMLImageElement | null) => void
  loaded: boolean
  handleLoad: (event: SyntheticEvent<HTMLImageElement>) => void
}

// Forward a node to either a callback ref or a ref object. Extracted to a
// module-level helper so the React compiler doesn't treat the ref mutation
// as a violation of hook-arg immutability.
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
