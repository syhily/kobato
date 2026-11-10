/**
 * The snapshot store — the getSnapshot/subscribe/emit skeleton every headless state module
 * publishes through (React subscribes via useSyncExternalStore). The unsubscribe contract is
 * two-layered: `subscribe`'s return detaches ONE listener, `dispose` drops every listener at
 * owner teardown; like the request track, the store stays usable after dispose (StrictMode
 * remounts reuse the instance and re-subscribe).
 */

export type SnapshotListener<TSnapshot> = (snapshot: TSnapshot) => void

export interface SnapshotStore<TSnapshot> {
  getSnapshot: () => TSnapshot
  /** Attach a listener; the returned function detaches it (React's effect cleanup path). */
  subscribe: (listener: SnapshotListener<TSnapshot>) => () => void
  /** Merge a partial snapshot and notify every listener (unless the change guard swallows the emit). */
  emit: (partial: Partial<TSnapshot>) => void
  /** Drop every listener (owner teardown). The store stays usable — a reused instance re-subscribes. */
  dispose: () => void
}

export interface SnapshotStoreOptions<TSnapshot> {
  /** Return false to swallow the emit: the state is not replaced and no listener is notified. */
  changeGuard?: (previous: TSnapshot, next: TSnapshot) => boolean
}

/** One state owner, one publish: the snapshot React subscribes to. */
export function createSnapshotStore<TSnapshot extends object>(
  initial: TSnapshot,
  { changeGuard }: SnapshotStoreOptions<TSnapshot> = {},
): SnapshotStore<TSnapshot> {
  let snapshot = initial
  const listeners = new Set<SnapshotListener<TSnapshot>>()
  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    emit(partial) {
      const next = { ...snapshot, ...partial }
      if (changeGuard && !changeGuard(snapshot, next)) {
        return
      }
      snapshot = next
      for (const listener of listeners) {
        listener(snapshot)
      }
    },
    dispose() {
      listeners.clear()
    },
  }
}
