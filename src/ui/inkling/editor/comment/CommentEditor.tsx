import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin'

import type { InklingDocument } from '@/shared/inkling/schema'

import { InklingEditor } from '@/ui/inkling/editor/InklingEditor'
import { COMMENT_NODES } from '@/ui/inkling/editor/nodes/registry'

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
      {children}
    </InklingEditor>
  )
}
