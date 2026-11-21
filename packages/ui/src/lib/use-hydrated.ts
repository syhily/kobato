import { useSyncExternalStore } from 'react'

const emptySubscribe = () => () => undefined

export function useHydrated(): boolean {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  )
}
