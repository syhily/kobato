import React from 'react'

import { createSnapshotStore, type SnapshotListener } from '@/utils/services/snapshot-store'

// Factory for the composer handle pattern (plans 038/047): a per-top-level-
// composer, editor-side channel in the shape getState / setState(partial) /
// subscribe. Non-React code (Lexical command handlers, plugins) reads state
// synchronously instead of closing over a stale React mirror, so behaviour
// listeners register once per mount instead of re-registering per render —
// see InklingBehaviourPlugin for the wiring rationale. React subscribes
// render-only via useSyncExternalStore. Each top-level composer creates one
// instance per channel in a provider — never a module singleton, so multiple
// composers on one page cannot clobber each other.
//
// The handle IS the shared snapshot store (@/utils/services/snapshot-store)
// with the keyed change guard: a setState that keeps every value identical
// is swallowed, so subscribers are not notified (and React does not
// re-render) for no-op writes.

export type ComposerHandleListener<T> = SnapshotListener<T>

export interface ComposerHandle<T> {
  getState: () => T
  setState: (partial: Partial<T>) => void
  subscribe: (listener: ComposerHandleListener<T>) => () => void
}

export interface ComposerHandleOptions<T> {
  /**
   * State keys whose record values compare ENTRY-WISE (per-key reference
   * compare) instead of by identity: a freshly built but content-equal
   * record publish is swallowed like any other no-op, so channels whose
   * feeds rebuild their maps each derivation (the footnote handle's
   * indices/definitionNodeKeys) don't hand-roll a second change guard.
   */
  recordKeys?: readonly (keyof T)[]
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
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
  const recordKeys = new Set<keyof T>(options?.recordKeys ?? [])
  const store = createSnapshotStore<T>(initialState, {
    changeGuard: (previous, next) =>
      (Object.keys(next) as (keyof T)[]).some((key) => {
        const before = previous[key]
        const after = next[key]
        if (recordKeys.has(key) && isPlainRecord(before) && isPlainRecord(after)) {
          return !isSameRecord(before, after)
        }
        return before !== after
      }),
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
// module-scope fallback instance (for consumers rendered outside any
// provider, e.g. isolated tests — real editors always get the provider's
// per-composer instance, so composers never share state through the default),
// a useHandle accessor for non-rendering consumers, and a render-only
// useHandleState subscription hook. useSyncExternalStore compares snapshots
// with Object.is, so a subscriber re-renders only when its selected slice
// changes — keep selectors returning primitives or stable references, not
// fresh objects. The optional H parameter carries a concrete handle subtype
// (one with extra methods, like the tk handle) through the binding — channels
// that use it must pass both type arguments explicitly, because TS skips
// inferring H once the state type argument is given.
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
