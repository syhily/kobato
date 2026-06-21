import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin'

import type { InklingDocument } from '@/shared/inkling/schema'

import {
  INKLING_COMMENT_MARKDOWN_TRANSFORMERS,
  useInklingMarkdownShortcuts,
} from '@/ui/inkling/editor/behaviour/markdown-shortcuts'
import { InklingEditor } from '@/ui/inkling/editor/InklingEditor'
import { COMMENT_NODES } from '@/ui/inkling/editor/nodes/registry'

/** Headless plugin that wires markdown shortcuts into the comment editor.
 *  Uses the comment-restricted transformer set (no HEADING — the comment
 *  node set has no HeadingNode). */
function CommentMarkdownShortcuts() {
  const [editor] = useLexicalComposerContext()
  useInklingMarkdownShortcuts(editor, INKLING_COMMENT_MARKDOWN_TRANSFORMERS)
  return null
}

export interface CommentInklingEditorProps {
  document: InklingDocument
  onChange: (document: InklingDocument) => void
  editable?: boolean
  placeholder?: string
  className?: string
  contentClassName?: string
  children?: React.ReactNode
}

export function CommentInklingEditor({
  document,
  onChange,
  editable,
  placeholder,
  className,
  contentClassName,
  children,
}: CommentInklingEditorProps) {
  return (
    <InklingEditor
      namespace="inkling-comment-editor"
      nodes={COMMENT_NODES}
      document={document}
      onChange={onChange}
      editable={editable}
      placeholder={placeholder}
      className={className}
      contentClassName={contentClassName}
    >
      <HistoryPlugin />
      <CommentMarkdownShortcuts />
      {children}
    </InklingEditor>
  )
}
