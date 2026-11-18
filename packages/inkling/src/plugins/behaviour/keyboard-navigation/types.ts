import type { CardSelectionStore } from '@kobato/inkling-internal/plugins/behaviour/card-selection-store'

export interface KeyboardNavigationDeps {
  store: CardSelectionStore
  isNested?: boolean
  cursorDidExitAtTop?: () => void
}
