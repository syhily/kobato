import React from 'react'

export function useDisposableStore<T extends { dispose(): void }>(create: () => T, deps: readonly unknown[]): T {
  // oxlint-disable-next-line react-hooks/exhaustive-deps -- deps are the hook's declared inputs
  const instance = React.useMemo(create, deps)
  React.useEffect(() => {
    return () => {
      instance.dispose()
    }
  }, [instance])

  return instance
}
