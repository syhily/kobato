import type { JSONContent } from '@tiptap/core'

import Link from '@tiptap/extension-link'
import Placeholder from '@tiptap/extension-placeholder'
import { type Editor, EditorContent, useEditor } from '@tiptap/react'
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
import { COMMENT_SLASH_COMMANDS } from '@/ui/public/comments/comment-slash-commands'
import { CommentEditorHint } from '@/ui/public/comments/CommentEditorHint'
import { CommentEditorToolbar } from '@/ui/public/comments/CommentEditorToolbar'

// Simplified Tiptap editor for comment bodies. Mirrors the admin
// `PageBodyEditor` shape but loads only the extensions needed for the
// comment dialect: paragraphs / lists / blockquote / inline marks /
// fenced code / inline math (`$…$` shortcut) / block math (slash
// menu). No headings, no image library, no music picker, no tables,
// no footnotes — those are filtered out at the slash menu, the
// `commentBodySchema` perimeter rejects any rogue blocks that slip
// past the editor UI.
//
// Round-tripping uses the same PT ↔ ProseMirror bridge as posts /
// pages, since `CommentBody` is a strict subset of the upstream PT
// dialect.

export interface CommentBodyEditorProps {
  /** Initial PortableText body. Read on first mount + when `bodyKey` changes. */
  initialBody: CommentBody
  /**
   * Identity of the body source — when this string changes the editor
   * resets its content from `initialBody`. Use it for the reply form
   * to reset after submit, or when switching the edited comment.
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

const EMPTY_BODY: CommentBody = []

function safeBodyToPmDoc(body: CommentBody): PmDoc {
  const result = safeValidateCommentBody(body)
  const safe = result.ok ? result.body : EMPTY_BODY
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
  // Pin the latest `onBodyChange` so re-renders from the parent don't
  // tear the editor's transaction handler. Same pattern as
  // TanStack Query mutations and `PageBodyEditor`.
  const onBodyChangeRef = useRef(onBodyChange)
  onBodyChangeRef.current = onBodyChange

  const placeholderText = placeholder ?? DEFAULT_PLACEHOLDER

  const extensions = useMemo(
    () => [
      StarterKit.configure({
        // Comments are unstructured prose — headings would let one
        // commenter visually outweigh the rest of the thread.
        heading: false,
        // No native image support; comments don't carry media uploads.
        // The PT schema rejects `image` blocks anyway.
        // StarterKit doesn't include an image extension by default,
        // so nothing to disable here, but list it for clarity.
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
      // `mathInline` mark + `$…$` input rule.
      MathInlineMark,
      // PM node for any `mathBlock` payloads round-tripping through
      // the bridge. The shared editor node view ships with a math
      // preview surface that's perfectly usable in the comment form.
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
      } else {
        // Editor produced a transient state that violates the comment
        // schema (rare — typically only between two transactions on a
        // freshly-inserted block). The save-side `canonicalizeCommentBody`
        // will surface a precise error if the body is still invalid at
        // submit time; for live updates we propagate the parent's most
        // recent valid body by skipping this tick.
      }
    },
  })

  // Reset content when `bodyKey` changes (form submit clears the editor,
  // switching the edited comment loads a different body).
  useEffect(() => {
    if (editor === null) {
      return
    }
    editor.commands.setContent(safeBodyToPmDoc(initialBody) as JSONContent, { emitUpdate: false })
    // `initialBody` ref isn't a stable dep — keying on `bodyKey` is
    // the documented contract for resetting.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bodyKey, editor])

  useEffect(() => {
    if (editor !== null) {
      editor.setEditable(disabled !== true)
    }
  }, [disabled, editor])

  return (
    <div
      className={cn(
        // `group/comment-editor` lets the toolbar listen for
        // `focus-within` on this wrapper without grabbing the focus
        // state itself.
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
          // Tiptap injects `.ProseMirror` on the contenteditable host.
          '[&_.ProseMirror]:min-h-[5rem] [&_.ProseMirror]:outline-none',
          // The Tailwind Typography plugin gives every `<p>` a top
          // margin via `.prose > :first-child` reset that only fires
          // for direct children — but our `<p>` sits inside the
          // injected `.ProseMirror` wrapper, so the reset misses and
          // the first paragraph picks up both the editor `py-2` AND
          // the prose-sm `<p>` margin. Zero out the first/last child
          // margins inside `.ProseMirror` so the caret hugs the
          // padding box instead of floating below it.
          '[&_.ProseMirror>:first-child]:mt-0 [&_.ProseMirror>:last-child]:mb-0',
        )}
      />
      <CommentEditorHint />
    </div>
  )
}

// Helper exposed so the consuming form can detect "no actual content" without
// poking into the editor instance directly.
export function isCommentBodyBlank(body: CommentBody): boolean {
  if (body.length === 0) {
    return true
  }
  for (const block of body) {
    if (block._type === 'code' && block.code.trim().length > 0) {
      return false
    }
    if (block._type === 'mathBlock' && block.tex.trim().length > 0) {
      return false
    }
    if (block._type === 'block') {
      for (const span of block.children) {
        if (span.text.trim().length > 0) {
          return false
        }
      }
    }
  }
  return true
}

// Re-export so callers that already import the editor can grab the empty
// body sentinel without a second import path.
export const EMPTY_COMMENT_BODY: CommentBody = EMPTY_BODY

// Avoid an unused-var lint error if a caller imports `Editor` from this module.
export type { Editor }
