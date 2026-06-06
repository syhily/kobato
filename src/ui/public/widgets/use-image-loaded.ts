import { useCallback, useLayoutEffect, useRef, useState, type Ref, type SyntheticEvent } from 'react'

export interface ImageLoadedHook {
  ref: (node: HTMLImageElement | null) => void
  loaded: boolean
  handleLoad: (event: SyntheticEvent<HTMLImageElement>) => void
}

export function useImageLoaded(
  externalRef: Ref<HTMLImageElement> | undefined,
  onLoad?: (event: SyntheticEvent<HTMLImageElement>) => void,
): ImageLoadedHook {
  const imgRef = useRef<HTMLImageElement | null>(null)
  const [loaded, setLoaded] = useState(false)

  useLayoutEffect(() => {
    if (imgRef.current?.complete) {
      setLoaded(true)
    }
  }, [])

  const ref = useCallback(
    (node: HTMLImageElement | null) => {
      imgRef.current = node
      if (typeof externalRef === 'function') {
        externalRef(node)
      } else if (externalRef && 'current' in externalRef) {
        ;(externalRef as React.RefObject<HTMLImageElement | null>).current = node
      }
      if (node?.complete) {
        setLoaded(true)
      }
    },
    [externalRef],
  )

  const handleLoad = useCallback(
    (event: SyntheticEvent<HTMLImageElement>) => {
      setLoaded(true)
      onLoad?.(event)
    },
    [onLoad],
  )

  return { ref, loaded, handleLoad }
}
