import type { CardSelectionStore } from '@/inkling/plugins/behaviour/cardSelectionStore'

export interface KeyboardNavigationDeps {
  store: CardSelectionStore
  isNested?: boolean
  cursorDidExitAtTop?: () => void
}
