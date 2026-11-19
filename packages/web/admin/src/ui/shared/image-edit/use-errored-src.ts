import { useState } from 'react'

export function useErroredSrc(src: string | null): [broken: boolean, markErrored: () => void] {
  const [erroredSrc, setErroredSrc] = useState<string | null>(null)
  return [src !== null && erroredSrc === src, () => setErroredSrc(src)]
}
