import { createSnapshotStore } from '@kobato/inkling-internal/services/snapshot-store'

export interface MenuNavigatorSnapshot {
  selectedItemIndex: number
  scrollToSelectedItem: boolean
}

export function createMenuNavigator() {
  const store = createSnapshotStore<MenuNavigatorSnapshot>({ selectedItemIndex: 0, scrollToSelectedItem: false })

  return {
    getSnapshot: store.getSnapshot,

    subscribe: store.subscribe,

    moveUp(maxItemIndex: number) {
      // an empty menu (maxItemIndex -1) has no selectable item — stay on 0
      // instead of wrapping to -1
      if (maxItemIndex < 0) {
        return
      }
      store.emit({
        scrollToSelectedItem: true,
        selectedItemIndex:
          store.getSnapshot().selectedItemIndex === 0 ? maxItemIndex : store.getSnapshot().selectedItemIndex - 1,
      })
    },

    moveDown(maxItemIndex: number) {
      // an empty menu (maxItemIndex -1) has no selectable item — stay on 0
      // instead of stepping to 1
      if (maxItemIndex < 0) {
        return
      }
      store.emit({
        scrollToSelectedItem: true,
        selectedItemIndex:
          store.getSnapshot().selectedItemIndex === maxItemIndex ? 0 : store.getSnapshot().selectedItemIndex + 1,
      })
    },

    reset() {
      if (store.getSnapshot().selectedItemIndex !== 0) {
        store.emit({ selectedItemIndex: 0 })
      }
    },

    consumeScrollRequest(): boolean {
      const requested = store.getSnapshot().scrollToSelectedItem
      if (requested) {
        store.emit({ scrollToSelectedItem: false })
      }
      return requested
    },

    selectedItem<T>(items: T[]): T | undefined {
      return items[store.getSnapshot().selectedItemIndex]
    },
  }
}

export type MenuNavigator = ReturnType<typeof createMenuNavigator>
