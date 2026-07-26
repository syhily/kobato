import type { JSONContent } from '@tiptap/core'

import Link from '@tiptap/extension-link'
import Placeholder from '@tiptap/extension-placeholder'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { useEffect, useMemo, useRef } from 'react'

import type { PmDoc } from '@/shared/pt/bridge/types'
import type { PortableTextBody } from '@/shared/pt/schema'

import { pmDocToBody } from '@/shared/pt/bridge/pm-to-pt'
import { bodyToPmDoc } from '@/shared/pt/bridge/pt-to-pm'
import { type CommentBody, safeValidateCommentBody } from '@/shared/pt/comment-schema'
import { BlockCardNode } from '@/ui/admin/editor/tiptap/BlockCardNode'
import { MathInlineMark } from '@/ui/admin/editor/tiptap/InlineMarks'
import { SlashCommandsExtension } from '@/ui/admin/editor/tiptap/SlashMenu'
import { cn } from '@/ui/lib/cn'
import { EMPTY_COMMENT_BODY } from '@/ui/public/comments/comment-body-helpers'
import { COMMENT_SLASH_COMMANDS } from '@/ui/public/comments/comment-slash-commands'
import { CommentEditorHint } from '@/ui/public/comments/CommentEditorHint'
import { CommentEditorToolbar } from '@/ui/public/comments/CommentEditorToolbar'

// Simplified Tiptap editor for comment bodies. Loads only extensions the comment dialect allows.

export interface CommentBodyEditorProps {
  /** Initial PortableText body. Read on first mount + when `bodyKey` changes. */
  initialBody: CommentBody
  /**
   * Identity of the body source — when this string changes the editor resets
   * its content from `initialBody` (e.g. reply form reset, switching comment).
   */
  bodyKey: string
  /** Fired on every editor update with the freshly-derived comment body. */
  onBodyChange: (body: CommentBody) => void
  /** When true, the editor becomes read-only. */
  disabled?: boolean
  /** Override the placeholder copy. */
  placeholder?: string
  /** Extra Tailwind classes applied to the editor content host. */
  className?: string
}

const DEFAULT_PLACEHOLDER = '写下你的评论…  / 命令，$ 公式'

function safeBodyToPmDoc(body: CommentBody): PmDoc {
  const result = safeValidateCommentBody(body)
  const safe = result.ok ? result.body : EMPTY_COMMENT_BODY
  return bodyToPmDoc(safe as PortableTextBody)
}

export function CommentBodyEditor({
  initialBody,
  bodyKey,
  onBodyChange,
  disabled,
  placeholder,
  className,
}: CommentBodyEditorProps) {
  const onBodyChangeRef = useRef(onBodyChange)
  useEffect(() => {
    onBodyChangeRef.current = onBodyChange
  })

  const placeholderText = placeholder ?? DEFAULT_PLACEHOLDER

  const extensions = useMemo(
    () => [
      StarterKit.configure({
        heading: false,
        horizontalRule: false,
        link: false,
        dropcursor: { color: '#3b82f6', width: 2 },
      }),
      Link.configure({
        openOnClick: false,
        autolink: true,
        HTMLAttributes: { class: null, target: null, rel: null },
      }),
      Placeholder.configure({ placeholder: placeholderText }),
      MathInlineMark,
      BlockCardNode,
      SlashCommandsExtension.configure({ commands: COMMENT_SLASH_COMMANDS }),
    ],
    [placeholderText],
  )

  const editor = useEditor({
    immediatelyRender: false,
    editable: disabled !== true,
    extensions,
    content: safeBodyToPmDoc(initialBody) as JSONContent,
    onUpdate({ editor: instance }) {
      const body = pmDocToBody(instance.getJSON() as PmDoc)
      const result = safeValidateCommentBody(body)
      if (result.ok) {
        onBodyChangeRef.current(result.body)
      }
    },
  })

  // Reset editor content when `bodyKey` changes, reading `initialBody` via a
  // ref — its identity changes every render, so depending on it would re-trigger the reset.
  const initialBodyRef = useRef(initialBody)
  useEffect(() => {
    initialBodyRef.current = initialBody
  })

  useEffect(() => {
    if (editor === null) {
      return
    }
    editor.commands.setContent(safeBodyToPmDoc(initialBodyRef.current) as JSONContent, { emitUpdate: false })
  }, [bodyKey, editor])

  useEffect(() => {
    if (editor !== null) {
      editor.setEditable(disabled !== true)
    }
  }, [disabled, editor])

  return (
    <div
      className={cn(
        'group/comment-editor',
        'rounded-md border border-line bg-background',
        'focus-within:border-brand focus-within:ring-1 focus-within:ring-brand/40',
        className,
      )}
    >
      {editor !== null && <CommentEditorToolbar editor={editor} disabled={disabled === true} />}
      <EditorContent
        editor={editor}
        className={cn(
          'prose-blog prose prose-sm max-w-none px-3 py-2',
          'min-h-[6rem]',
          'wrap-break-word whitespace-normal',
          '[&_.ProseMirror]:min-h-[5rem] [&_.ProseMirror]:outline-none',
          '[&_.ProseMirror>:first-child]:mt-0 [&_.ProseMirror>:last-child]:mb-0',
        )}
      />
      <CommentEditorHint />
    </div>
  )
}
