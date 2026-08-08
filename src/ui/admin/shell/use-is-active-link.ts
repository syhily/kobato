import { useLocation, useMatch } from 'react-router'

export function useIsActiveLink(path?: string, activeOnSubpath = false, end = false): boolean {
  const qIdx = path?.indexOf('?') ?? -1
  const safePath = path ?? ''
  const pathPart = qIdx >= 0 ? safePath.slice(0, qIdx) : safePath
  const searchPart = qIdx >= 0 ? safePath.slice(qIdx + 1) : ''

  const pattern = pathPart ? (activeOnSubpath ? `${pathPart}/*` : pathPart) : ''
  const match = useMatch({ path: pattern, end })
  const { search: currentSearch } = useLocation()

  if (match === null) {
    return false
  }

  if (searchPart) {
    const targetParams = new URLSearchParams(searchPart)
    const currentParams = new URLSearchParams(currentSearch)
    for (const [key, value] of targetParams) {
      if (currentParams.get(key) !== value) {
        return false
      }
    }
    return true
  }

  // Exact-match links without search params stay inactive when a more specific (search-parameterised) sibling matches.
  if (end && currentSearch) {
    return false
  }

  return true
}
