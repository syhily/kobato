import '@kobato/inkling/styles/index.css'
import '@kobato/inkling/styles/comment-editor.css'
import type { InklingLabelsInput } from '@kobato/inkling-internal/labels/inkling-labels'
import type { CommentEditorState } from '@kobato/inkling/headless/comment-schema'

import { COMMENT_EDITOR_NODES } from '@kobato/inkling-internal/comment/editor/comment-editor-nodes'
import { downgradeLegacyCommentMath } from '@kobato/inkling-internal/comment/editor/comment-legacy-math'
import { COMMENT_MARKDOWN_TRANSFORMERS } from '@kobato/inkling-internal/comment/editor/comment-markdown-transformers'
import InklingHostComposer from '@kobato/inkling-internal/components/InklingHostComposer'
import InklingSurface from '@kobato/inkling-internal/components/InklingSurface'
import { blockQuoteAsideCycle } from '@kobato/inkling-internal/hooks/block-quote-aside-cycle'
import { useEditorSurface } from '@kobato/inkling-internal/hooks/use-editor-surface'
import { registerCardDecorateAdapter } from '@kobato/inkling-internal/nodes/decorate-card'
import { EMPTY_COMMENT_EDITOR_STATE, safeValidateCommentEditorState } from '@kobato/inkling/headless/comment-schema'
import { cn } from '@kobato/ui/lib/cn'
import { ListPlugin } from '@lexical/react/LexicalListPlugin'
import { useCallback } from 'react'

registerCardDecorateAdapter()

export interface CommentBodyEditorProps {
  initialBody: CommentEditorState
  bodyKey: string
  onBodyChange: (body: CommentEditorState) => void
  disabled?: boolean
  className?: string
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
      <InklingHostComposer
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
      </InklingHostComposer>
    </div>
  )
}
