import React from 'react'

import { createCardPickerStore } from '../plugins/behaviour/cardPickerStore'
import { createCardSelectionStore } from '../plugins/behaviour/cardSelectionStore'
import { createDragDropHandle } from '../plugins/behaviour/dragDropHandle'
import { createFootnoteHandle } from '../plugins/behaviour/footnoteHandle'
import { createTKHandle } from '../plugins/behaviour/tkHandle'
import { createWordCountHandle } from '../plugins/behaviour/wordCountHandle'
import { CardPickerStoreContext } from './CardPickerStoreContext'
import { CardSelectionStoreContext } from './CardSelectionStoreContext'
import { DragDropHandleContext } from './DragDropHandleContext'
import { FootnoteHandleContext } from './FootnoteHandleContext'
import { TKHandleContext } from './TKHandleContext'
import { WordCountHandleContext } from './WordCountHandleContext'

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
