import { createSnapshotStore } from '@/utils/services/snapshot-store'

// Card menu navigator — the headless state machine owning the slash menu's
// keyboard selection: the wrap-around index policy, the scroll-request latch,
// and the reset-on-rebuild. Same shape as `@/hooks/search-coordinator`: the
// shared snapshot store (@/utils/services/snapshot-store) publishes the
// state, so the wrap/reset/enter-resolution matrix is a synchronous test
// table. CardMenuPopup keeps the Lexical command registrations and calls in;
// CardMenu renders the snapshot as-is.

export interface MenuNavigatorSnapshot {
  selectedItemIndex: number
  scrollToSelectedItem: boolean
}

export function createMenuNavigator() {
  const store = createSnapshotStore<MenuNavigatorSnapshot>({ selectedItemIndex: 0, scrollToSelectedItem: false })

  return {
    getSnapshot: store.getSnapshot,

    subscribe: store.subscribe,

    /** Arrow up/left: step back one item, wrapping to the last from the first. Latches a scroll request. */
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

    /** Arrow down/right: step forward one item, wrapping to the first from the last. Latches a scroll request. */
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

    /** Menu rebuilt (query/config changed): the selection returns to the first item. The scroll latch is untouched. */
    reset() {
      if (store.getSnapshot().selectedItemIndex !== 0) {
        store.emit({ selectedItemIndex: 0 })
      }
    },

    /** Read and clear the scroll-request latch (menu close). Returns whether a scroll was pending. */
    consumeScrollRequest(): boolean {
      const requested = store.getSnapshot().scrollToSelectedItem
      if (requested) {
        store.emit({ scrollToSelectedItem: false })
      }
      return requested
    },

    /** Enter resolution: the item at the current index in the flat render-ordered list. */
    selectedItem<T>(items: T[]): T | undefined {
      return items[store.getSnapshot().selectedItemIndex]
    },
  }
}

export type MenuNavigator = ReturnType<typeof createMenuNavigator>
