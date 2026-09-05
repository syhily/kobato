/**
 * The snapshot store — the one home of the getSnapshot/subscribe/emit
 * skeleton every headless state module publishes through (CONTEXT.md
 * "snapshot store"). One state owner, one publish: React subscribes to the
 * snapshot through useSyncExternalStore (which already Object.is-guards
 * re-renders) and `emit` merges a partial.
 *
 * The optional `changeGuard` swallows a no-op emit before anyone is
 * notified — return false and the state stays put and listeners are not
 * called. The composer handle's keyed shallow guard
 * (src/plugins/behaviour/composer-handle.ts) is the one consumer; the
 * default is notify-always, so emit sites keep their own early returns
 * where they already had them.
 *
 * Listeners receive the new snapshot; a `() => void` listener (what
 * useSyncExternalStore passes) simply ignores it. The unsubscribe contract
 * is two-layered: `subscribe`'s returned function detaches ONE listener
 * (what React's effect cleanup calls), and `dispose` drops every listener
 * at owner teardown — a service's dispose stops its request track and its
 * store together (src/utils/services/service-machine.ts). Like the track,
 * the store stays usable after dispose (StrictMode remounts reuse the
 * instance and re-subscribe); dispose is a listener reset, not a death
 * sentence.
 *
 * The request track (src/utils/services/request-track.ts) composes this
 * store with its scheduler port and latest-wins guard; the menu navigator
 * (src/hooks/card-menu-navigation.ts), the gallery images mirror
 * (src/hooks/gallery-images-mirror.ts), and the composer handle share the
 * skeleton without a request line.
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
