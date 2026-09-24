import React from 'react'

import { DEFAULT_LABELS, type InklingLabels } from '@/inkling/labels/inkling-labels'

// UI-preference lifecycle (plan 047): display toggles that re-render the
// editor chrome but never change document behaviour. `labels` is the resolved
// labels table — the composer merges the host's
// overrides once; the default keeps context consumers usable without a
// provider (isolated component tests, stories).
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
  labels: InklingLabels
}

const InklingUiPrefsContext = React.createContext<InklingUiPrefsContextValue>({
  darkMode: false,
  labels: DEFAULT_LABELS,
})

export default InklingUiPrefsContext
