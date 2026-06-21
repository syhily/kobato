import type { LexicalEditor } from 'lexical'
import type { RefObject } from 'react'

import type { InklingDocument } from '@/shared/inkling/schema'
import type { InklingArticleEditorActions } from '@/ui/inkling/editor/article/article-editor-context'

export interface InklingArticleEditorProps {
  /** Initial document. Only read on first mount + when `documentKey` changes. */
  initialDocument: InklingDocument
  /** Identity of the body source. When this changes the editor resets. */
  documentKey: string
  /** Fired on every editor update with a freshly derived Inkling document. */
  onDocumentChange: (document: InklingDocument) => void
  /** When true, the editor becomes read-only. */
  disabled?: boolean
  /** Injected actions so cards can open pickers without importing server code. */
  actions?: InklingArticleEditorActions
  /** Ref the shell mounts into so picker callbacks can reach the editor. */
  editorRef?: RefObject<LexicalEditor | null>
  /** Ref to the scrollable container so the parent shell can wire scroll sync. */
  scrollContainerRef?: RefObject<HTMLDivElement | null>
  /** Shell-level actions rendered next to editor controls. */
  floatingActions?: React.ReactNode
}
