import React from 'react'

import { DEFAULT_LABELS, type InklingLabels } from '@/labels/inkling-labels'

// UI-preference lifecycle (plan 047): display toggles that re-render the
// editor chrome but never change document behaviour. `labels` is the resolved
// labels table — the composer merges the host's
// overrides once; the default keeps context consumers usable without a
// provider (isolated component tests, stories).
export interface InklingUiPrefsContextValue {
  darkMode: boolean
  isTKEnabled?: boolean
  labels: InklingLabels
}

const InklingUiPrefsContext = React.createContext<InklingUiPrefsContextValue>({
  darkMode: false,
  labels: DEFAULT_LABELS,
})

export default InklingUiPrefsContext
