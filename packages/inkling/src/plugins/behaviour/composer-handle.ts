import { createSnapshotStore, type SnapshotListener } from '@kobato/inkling-internal/services/snapshot-store'
import React from 'react'

export type ComposerHandleListener<T> = SnapshotListener<T>

export interface ComposerHandle<T> {
  getState: () => T
  setState: (partial: Partial<T>) => void
  subscribe: (listener: ComposerHandleListener<T>) => () => void
}

export interface ComposerHandleOptions<T> {
  recordKeys?: readonly (keyof T)[]
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isSameRecord(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  const aKeys = Object.keys(a)
  const bKeys = Object.keys(b)
  return aKeys.length === bKeys.length && aKeys.every((key) => a[key] === b[key])
}

export function createComposerHandle<T extends object>(
  initialState: T,
  options?: ComposerHandleOptions<T>,
): ComposerHandle<T> {
  const recordKeys = new Set<PropertyKey>(options?.recordKeys ?? [])
  const store = createSnapshotStore<T>(initialState, {
    changeGuard: (previous, next) => {
      if (!isObjectRecord(previous) || !isObjectRecord(next)) {
        return previous !== next
      }
      return Object.keys(next).some((key) => {
        const before = previous[key]
        const after = next[key]
        if (recordKeys.has(key) && isPlainRecord(before) && isPlainRecord(after)) {
          return !isSameRecord(before, after)
        }
        return before !== after
      })
    },
  })
  return {
    getState: store.getSnapshot,
    setState: store.emit,
    subscribe: store.subscribe,
  }
}

export interface ComposerHandleBinding<T, H extends ComposerHandle<T> = ComposerHandle<T>> {
  Context: React.Context<H>
  useHandle: () => H
  useHandleState: <S>(selector: (state: T) => S) => S
}

export function createComposerHandleBinding<T extends object, H extends ComposerHandle<T> = ComposerHandle<T>>(
  createHandle: () => H,
): ComposerHandleBinding<T, H> {
  const Context = React.createContext<H>(createHandle())

  function useHandle(): H {
    return React.useContext(Context)
  }

  function useHandleState<S>(selector: (state: T) => S): S {
    const handle = React.useContext(Context)
    const getSnapshot = () => selector(handle.getState())
    return React.useSyncExternalStore(handle.subscribe, getSnapshot, getSnapshot)
  }

  return { Context, useHandle, useHandleState }
}
