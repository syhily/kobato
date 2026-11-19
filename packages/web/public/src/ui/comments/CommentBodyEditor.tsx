import '@kobato/inkling/styles/index.css'
import '@kobato/web-public/styles/inkling-comment-editor.css'
import type { InklingLabelsInput } from '@kobato/inkling'
import type { CommentEditorState } from '@kobato/lexical/comment-schema.ts'

import { InklingSurface, ListPlugin } from '@kobato/inkling'
import { EMPTY_COMMENT_EDITOR_STATE, safeValidateCommentEditorState } from '@kobato/lexical/comment-schema.ts'
import { cn } from '@kobato/ui/lib/cn.ts'
import { blockQuoteAsideCycle } from '@kobato/web-client/editor/block-quote-aside-cycle.ts'
import { EditorSurfaceComposer, useEditorSurface } from '@kobato/web-client/editor/editor-surface.tsx'
import { COMMENT_EDITOR_NODES } from '@kobato/web-public/ui/comments/editor/comment-editor-nodes.ts'
import { downgradeLegacyCommentMath } from '@kobato/web-public/ui/comments/editor/comment-legacy-math.ts'
import { COMMENT_MARKDOWN_TRANSFORMERS } from '@kobato/web-public/ui/comments/editor/comment-markdown-transformers.ts'
import { useCallback } from 'react'

export interface CommentBodyEditorProps {
  /** Initial comment state; reseeded on mount and when `bodyKey` changes. */
  initialBody: CommentEditorState
  bodyKey: string
  onBodyChange: (body: CommentEditorState) => void
  disabled?: boolean
  className?: string
  /**
   * Label overlay for the composer. Workspace documents omit it (the root payload
   * supplies the table); public documents pass the table the lazy wrapper loaded.
   */
  labels?: InklingLabelsInput
}

function safeInitialState(body: CommentEditorState): CommentEditorState {
  const result = safeValidateCommentEditorState(body)
  return result.ok ? downgradeLegacyCommentMath(result.state) : EMPTY_COMMENT_EDITOR_STATE
}

export function CommentBodyEditor({
  initialBody,
  bodyKey,
  onBodyChange,
  disabled,
  className,
  labels,
}: CommentBodyEditorProps) {
  const { editorInstance, registerAPI, mountedInitialState, handleChange } = useEditorSurface({
    initialBody,
    bodyKey,
    onBodyChange,
    prepareSeed: safeInitialState,
  })

  // Click-to-focus fallback for residual non-editable hits, and for a click React's
  // selective hydration replayed after this boundary hydrated: the replayed untrusted
  // mousedown never focuses the contenteditable, but the replayed click runs this handler.
  // Skipped while the editor owns focus so in-editor caret placement is undisturbed.
  const focusEditor = useCallback(() => {
    if (disabled === true) {
      return
    }
    const root = editorInstance?.getRootElement()
    if (root && !root.contains(document.activeElement)) {
      editorInstance?.focus()
    }
  }, [disabled, editorInstance])

  return (
    <div
      className={cn(
        'kobato-comment-editor group/comment-editor',
        'rounded-md border border-line bg-transparent',
        'focus-within:border-brand focus-within:ring-1 focus-within:ring-brand/40',
        className,
      )}
      onClick={focusEditor}
      onKeyDownCapture={blockQuoteAsideCycle}
    >
      <EditorSurfaceComposer
        nodes={COMMENT_EDITOR_NODES}
        initialEditorState={mountedInitialState}
        labels={labels}
        isEmojiEnabled={false}
        codeEditor="plain"
      >
        <InklingSurface
          readOnly={disabled === true}
          onChange={handleChange}
          registerAPI={registerAPI}
          placeholder={<></>}
          contentEditableClassName="typeset typeset-comment"
          markdownTransformers={COMMENT_MARKDOWN_TRANSFORMERS}
          isSnippetsEnabled={false}
          isDragEnabled={false}
        >
          <ListPlugin />
        </InklingSurface>
      </EditorSurfaceComposer>
    </div>
  )
}
