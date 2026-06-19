import type { InitialConfigType } from '@lexical/react/LexicalComposer'

import { LinkNode } from '@lexical/link'
import { ListItemNode, ListNode } from '@lexical/list'
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin'
import { QuoteNode } from '@lexical/rich-text'
import { ParagraphNode } from 'lexical'

import type { InklingDocument } from '@/shared/inkling/schema'

import { CodeBlockNode } from '@/ui/inkling/editor/comment/nodes/CodeBlockNode'
import { InlineMathNode } from '@/ui/inkling/editor/comment/nodes/InlineMathNode'
import { MathBlockNode } from '@/ui/inkling/editor/comment/nodes/MathBlockNode'
import { InklingEditor } from '@/ui/inkling/editor/InklingEditor'

const COMMENT_EDITOR_NODES: InitialConfigType['nodes'] = [
  ParagraphNode,
  QuoteNode,
  ListNode,
  ListItemNode,
  LinkNode,
  CodeBlockNode,
  MathBlockNode,
  InlineMathNode,
]

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
      nodes={COMMENT_EDITOR_NODES}
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
