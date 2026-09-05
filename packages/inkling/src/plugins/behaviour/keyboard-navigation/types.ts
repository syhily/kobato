import type { CardSelectionStore } from '../cardSelectionStore'

export interface KeyboardNavigationDeps {
  store: CardSelectionStore
  isNested?: boolean
  cursorDidExitAtTop?: () => void
}
