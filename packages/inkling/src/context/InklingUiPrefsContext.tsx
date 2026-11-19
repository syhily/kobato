import { DEFAULT_LABELS, type InklingLabels } from '@kobato/inkling-internal/labels/inkling-labels'
import React from 'react'

export interface InklingUiPrefsContextValue {
  darkMode: boolean
  isTKEnabled?: boolean

  isEmojiEnabled?: boolean
  codeEditor?: 'rich' | 'plain'

  wordCountLanguage?: string
  labels: InklingLabels
}

const InklingUiPrefsContext = React.createContext<InklingUiPrefsContextValue>({
  darkMode: false,
  labels: DEFAULT_LABELS,
})

export default InklingUiPrefsContext
