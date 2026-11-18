import { CardPickerStoreContext } from '@kobato/inkling-internal/context/CardPickerStoreContext'
import { CardSelectionStoreContext } from '@kobato/inkling-internal/context/CardSelectionStoreContext'
import { DragDropHandleContext } from '@kobato/inkling-internal/context/DragDropHandleContext'
import { FootnoteHandleContext } from '@kobato/inkling-internal/context/FootnoteHandleContext'
import { TKHandleContext } from '@kobato/inkling-internal/context/TKHandleContext'
import { WordCountHandleContext } from '@kobato/inkling-internal/context/WordCountHandleContext'
import { createCardPickerStore } from '@kobato/inkling-internal/plugins/behaviour/cardPickerStore'
import { createCardSelectionStore } from '@kobato/inkling-internal/plugins/behaviour/cardSelectionStore'
import { createDragDropHandle } from '@kobato/inkling-internal/plugins/behaviour/dragDropHandle'
import { createFootnoteHandle } from '@kobato/inkling-internal/plugins/behaviour/footnoteHandle'
import { createTKHandle } from '@kobato/inkling-internal/plugins/behaviour/tkHandle'
import { createWordCountHandle } from '@kobato/inkling-internal/plugins/behaviour/wordCountHandle'
import React from 'react'

// Owns the composer's handle stack: one instance per handle per mounted
// provider (the useState initializers keep them stable), and nested composers
// share the top-level handles. The providers never read each other's context,
// so their nesting order carries no semantics.
export function ComposerHandlesProvider({ children }: { children: React.ReactNode }) {
  const [dragDropHandle] = React.useState(createDragDropHandle)
  const [wordCountHandle] = React.useState(createWordCountHandle)
  const [cardSelectionStore] = React.useState(createCardSelectionStore)
  const [cardPickerStore] = React.useState(createCardPickerStore)
  const [tkHandle] = React.useState(createTKHandle)
  const [footnoteHandle] = React.useState(createFootnoteHandle)

  return (
    <DragDropHandleContext.Provider value={dragDropHandle}>
      <WordCountHandleContext.Provider value={wordCountHandle}>
        <CardSelectionStoreContext.Provider value={cardSelectionStore}>
          <CardPickerStoreContext.Provider value={cardPickerStore}>
            <TKHandleContext.Provider value={tkHandle}>
              <FootnoteHandleContext.Provider value={footnoteHandle}>{children}</FootnoteHandleContext.Provider>
            </TKHandleContext.Provider>
          </CardPickerStoreContext.Provider>
        </CardSelectionStoreContext.Provider>
      </WordCountHandleContext.Provider>
    </DragDropHandleContext.Provider>
  )
}
