export type SnapshotListener<TSnapshot> = (snapshot: TSnapshot) => void

export interface SnapshotStore<TSnapshot> {
  getSnapshot: () => TSnapshot
  subscribe: (listener: SnapshotListener<TSnapshot>) => () => void
  emit: (partial: Partial<TSnapshot>) => void
  dispose: () => void
}

export interface SnapshotStoreOptions<TSnapshot> {
  changeGuard?: (previous: TSnapshot, next: TSnapshot) => boolean
}

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
