import type { EmojiLocale } from '@kobato/inkling-internal/plugins/behaviour/emoji-datasets'

import { DEFAULT_LABELS, type InklingLabels } from '@kobato/inkling-internal/labels/inkling-labels'
import { createContext } from 'react'
export interface InklingUiPrefsContextValue {
  darkMode: boolean
  isTKEnabled?: boolean

  isEmojiEnabled?: boolean
  codeEditor?: 'rich' | 'plain'

  wordCountLanguage?: string
  emojiLocale?: EmojiLocale
  labels: InklingLabels
}

const InklingUiPrefsContext = createContext<InklingUiPrefsContextValue>({
  darkMode: false,
  labels: DEFAULT_LABELS,
})

export default InklingUiPrefsContext
