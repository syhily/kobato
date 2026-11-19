import { createSnapshotStore, type SnapshotListener } from '@kobato/inkling-internal/services/snapshot-store'
import React from 'react'

export type ComposerHandleListener<T> = SnapshotListener<T>

export interface ComposerHandle<T> {
  getState: () => T
  setState: (partial: Partial<T>) => void
  subscribe: (listener: ComposerHandleListener<T>) => () => void
}

export interface ComposerHandleOptions<T> {
  /**
   * State keys whose record values compare ENTRY-WISE instead of by identity, so a
   * freshly built but content-equal record publish is swallowed like any other no-op
   * (e.g. the footnote handle's indices/definitionNodeKeys).
   */
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

// React binding for one composer handle channel: a context whose default is a
// module-scope fallback instance for consumers outside any provider (e.g. isolated
// tests); real editors always get the provider's per-composer instance, so composers
// never share state through the default. useSyncExternalStore compares snapshots with
// Object.is, so selectors must return primitives or stable references, not fresh
// objects. The optional H parameter carries a concrete handle subtype (e.g. the tk
// handle's extra methods); channels using it must pass both type arguments, because TS
// skips inferring H once the state type argument is given.
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
