import type { LexicalEditor } from 'lexical'
import type { RefObject } from 'react'

import type { InklingDocument } from '@/shared/inkling/schema'
import type { InklingArticleEditorActions } from '@/ui/inkling/editor/article/article-editor-context'

/**
 * Synchronous flush handle exposed by the article editor. Calling it forces
 * the pending (debounced) document merge to run immediately and returns the
 * resulting validated document. Returns `null` when the editor hasn't mounted
 * or the document fails schema validation. Used by the editor shell to
 * capture the very latest edits — including footnote-definition merges —
 * before a save/publish mutation fires.
 */
export type InklingFlushHandle = () => InklingDocument | null

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
  /** Populated with a synchronous flush handle the shell calls before save
   *  / publish to capture the latest edits (see {@link InklingFlushHandle}). */
  flushHandleRef?: RefObject<InklingFlushHandle | null>
  /** Shell-level actions rendered next to editor controls. */
  floatingActions?: React.ReactNode
}
