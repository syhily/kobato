import React from 'react'

import { CardPickerStoreContext } from '@/inkling/context/CardPickerStoreContext'
import { CardSelectionStoreContext } from '@/inkling/context/CardSelectionStoreContext'
import { DragDropHandleContext } from '@/inkling/context/DragDropHandleContext'
import { FootnoteHandleContext } from '@/inkling/context/FootnoteHandleContext'
import { TKHandleContext } from '@/inkling/context/TKHandleContext'
import { WordCountHandleContext } from '@/inkling/context/WordCountHandleContext'
import { createCardPickerStore } from '@/inkling/plugins/behaviour/cardPickerStore'
import { createCardSelectionStore } from '@/inkling/plugins/behaviour/cardSelectionStore'
import { createDragDropHandle } from '@/inkling/plugins/behaviour/dragDropHandle'
import { createFootnoteHandle } from '@/inkling/plugins/behaviour/footnoteHandle'
import { createTKHandle } from '@/inkling/plugins/behaviour/tkHandle'
import { createWordCountHandle } from '@/inkling/plugins/behaviour/wordCountHandle'

// The one owner of the composer's handle stack (CONTEXT.md: "composer
// handle"): creates the six per-top-level-composer handles and nests their
// providers, so the composer tree declares one wrapper instead of a
// hand-nested pyramid. One instance per handle per mounted provider (the
// useState initializers keep them stable); nested composers share the
// top-level handles exactly as before. The handle providers never read each
// other's context, so their nesting order carries no semantics.
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
