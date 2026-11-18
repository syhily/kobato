import type { CardSelectionStore } from '@kobato/inkling-internal/plugins/behaviour/cardSelectionStore'

export interface KeyboardNavigationDeps {
  store: CardSelectionStore
  isNested?: boolean
  cursorDidExitAtTop?: () => void
}
