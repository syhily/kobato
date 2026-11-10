import React from 'react'

import { DEFAULT_LABELS, type InklingLabels } from '@/inkling/labels/inkling-labels'

// Display toggles: they re-render editor chrome but never change document
// behaviour. `labels` is already merged with the host's overrides; the default
// keeps consumers usable without a provider (isolated tests, stories).
export interface InklingUiPrefsContextValue {
  darkMode: boolean
  isTKEnabled?: boolean
  /** Surface flag: mount the emoji typeahead in nested/caption editors.
   * Defaults to true; minimal surfaces (kobato's comment composer) opt out. */
  isEmojiEnabled?: boolean
  /** Surface flag: how code block cards edit. 'rich' (default) is the
   * CodeMirror-backed editor; 'plain' is a static auto-sizing textarea that
   * never loads the CodeMirror chunk. */
  codeEditor?: 'rich' | 'plain'
  /** BCP 47 language for Intl.Segmenter word counting. Seeds
   * `WordCountPlugin`'s default and publishes on the word-count handle so
   * nested composers segment in the same language. */
  wordCountLanguage?: string
  labels: InklingLabels
}

const InklingUiPrefsContext = React.createContext<InklingUiPrefsContextValue>({
  darkMode: false,
  labels: DEFAULT_LABELS,
})

export default InklingUiPrefsContext
