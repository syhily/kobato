import { CardPickerStoreContext } from '@kobato/inkling-internal/context/CardPickerStoreContext'
import { CardSelectionStoreContext } from '@kobato/inkling-internal/context/CardSelectionStoreContext'
import { DragDropHandleContext } from '@kobato/inkling-internal/context/DragDropHandleContext'
import { FootnoteHandleContext } from '@kobato/inkling-internal/context/FootnoteHandleContext'
import { TKHandleContext } from '@kobato/inkling-internal/context/TKHandleContext'
import { WordCountHandleContext } from '@kobato/inkling-internal/context/WordCountHandleContext'
import { createCardPickerStore } from '@kobato/inkling-internal/plugins/behaviour/card-picker-store'
import { createCardSelectionStore } from '@kobato/inkling-internal/plugins/behaviour/card-selection-store'
import { createDragDropHandle } from '@kobato/inkling-internal/plugins/behaviour/drag-drop-handle'
import { createFootnoteHandle } from '@kobato/inkling-internal/plugins/behaviour/footnote-handle'
import { createTKHandle } from '@kobato/inkling-internal/plugins/behaviour/tk-handle'
import { createWordCountHandle } from '@kobato/inkling-internal/plugins/behaviour/word-count-handle'
import React from 'react'

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
