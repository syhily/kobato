import React from 'react'

const emptySubscribe = () => () => undefined

export function useHydrated(): boolean {
  return React.useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  )
}
