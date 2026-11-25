import { useEffect, useMemo } from 'react'
export function useDisposableStore<T extends { dispose(): void }>(create: () => T, deps: readonly unknown[]): T {
  // oxlint-disable-next-line react/use-memo, react-hooks/exhaustive-deps
  const instance = useMemo(create, deps)
  useEffect(() => {
    return () => {
      instance.dispose()
    }
  }, [instance])

  return instance
}
