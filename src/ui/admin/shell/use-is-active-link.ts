import { useMatch } from 'react-router'

export function useIsActiveLink(path?: string, activeOnSubpath = false, end = false): boolean {
  const pattern = path ? (activeOnSubpath ? `${path}/*` : path) : ''
  const match = useMatch({ path: pattern, end })
  return match !== null
}
