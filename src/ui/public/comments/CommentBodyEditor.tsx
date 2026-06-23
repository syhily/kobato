import { useEffect, useRef } from 'react'

import type { InklingDocument } from '@/shared/inkling/schema'

import { EMPTY_INKLING_DOCUMENT } from '@/shared/inkling/empty'
import { CommentInklingEditor } from '@/ui/inkling/editor/comment/CommentEditor'
import { cn } from '@/ui/lib/cn'
import { CommentInsertActions } from '@/ui/public/comments/CommentInsertActions'

// Lexical-based comment editor. Emits Inkling JSON only; no Tiptap/PT runtime.
//
// By design this reads as a plain textarea: no top toolbar, no placeholder,
// no footer hint. Inline formats surface through the bubble menu on text
// selection; list/quote via markdown shortcuts; code-block / math-block via
// the two faded-in insert buttons in the bottom-right corner.

export interface CommentBodyEditorProps {
  /** Initial Inkling document. Read on first mount + when `documentKey` changes. */
  initialDocument: InklingDocument
  /**
   * Identity of the document source — when this string changes the editor
   * resets its content from `initialDocument`. Use it for the reply form
   * to reset after submit, or when switching the edited comment.
   */
  documentKey: string
  /** Fired on every editor update with the freshly-derived Inkling document. */
  onDocumentChange: (document: InklingDocument) => void
  /** When true, the editor becomes read-only. */
  disabled?: boolean
  /** Extra Tailwind classes applied to the editor content host. */
  className?: string
}

function safeInitialDocument(document: InklingDocument | undefined): InklingDocument {
  if (document === undefined || document.root.children.length === 0) {
    return EMPTY_INKLING_DOCUMENT
  }
  return document
}

export function CommentBodyEditor({
  initialDocument,
  documentKey,
  onDocumentChange,
  disabled,
  className,
}: CommentBodyEditorProps) {
  const onDocumentChangeRef = useRef(onDocumentChange)
  useEffect(() => {
    onDocumentChangeRef.current = onDocumentChange
  })

  const document = safeInitialDocument(initialDocument)

  // Reset editor content when `documentKey` changes.
  const keyRef = useRef(documentKey)
  useEffect(() => {
    keyRef.current = documentKey
  }, [documentKey])

  return (
    <div
      className={cn(
        'group/comment-editor',
        'relative rounded-md border border-line bg-background',
        'focus-within:border-brand focus-within:ring-1 focus-within:ring-brand/40',
        className,
      )}
    >
      <CommentInklingEditor
        key={documentKey}
        document={document}
        onChange={(next) => {
          onDocumentChangeRef.current(next)
        }}
        editable={disabled !== true}
        contentClassName={cn(
          'comment-content px-3 py-2',
          'min-h-[6rem]',
          'wrap-break-word whitespace-normal',
          '[&_.lexical-editor]:min-h-[5rem] [&_.lexical-editor]:outline-none',
          '[&_.lexical-editor>:first-child]:mt-0 [&_.lexical-editor>:last-child]:mb-0',
        )}
      >
        {disabled !== true ? <CommentInsertActions /> : null}
      </CommentInklingEditor>
    </div>
  )
}
