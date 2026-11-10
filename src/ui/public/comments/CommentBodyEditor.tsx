// Trimmed inkling comment composer — no cards, slash menu, or card insert; kobato glue
// (node set, markdown transformers, labels, legacy math downgrade) lives in `@/client/editor/`.
// Load only through `./LazyCommentBodyEditor`: this module, the inkling island, and
// `inkling-comment-editor.css` must stay in a lazy chunk so the public post page's static
// import graph stays editor-free. `isEmojiEnabled={false}` keeps the emoji-mart chunk out of
// nested editors; `codeEditor="plain"` avoids the CodeMirror chunk here.

import '@/styles/inkling-comment-editor.css'
import { useCallback } from 'react'

import type { InklingLabelsInput } from '@/inkling'
import type { CommentEditorState } from '@/shared/lexical/comment-schema'

import { blockQuoteAsideCycle } from '@/client/editor/block-quote-aside-cycle'
import { COMMENT_EDITOR_NODES } from '@/client/editor/comment-editor-nodes'
import { downgradeLegacyCommentMath } from '@/client/editor/comment-legacy-math'
import { COMMENT_MARKDOWN_TRANSFORMERS } from '@/client/editor/comment-markdown-transformers'
import { EditorSurfaceComposer, useEditorSurface } from '@/client/editor/editor-surface'
import { InklingSurface, ListPlugin } from '@/inkling'
import { EMPTY_COMMENT_EDITOR_STATE, safeValidateCommentEditorState } from '@/shared/lexical/comment-schema'
import { cn } from '@/ui/lib/cn'

export interface CommentBodyEditorProps {
  /** Initial comment state; reseeded on mount and when `bodyKey` changes. */
  initialBody: CommentEditorState
  /** Identity of the body source; a change reseeds the content from `initialBody`. */
  bodyKey: string
  /** Fired on every editor update with the serialized comment state. */
  onBodyChange: (body: CommentEditorState) => void
  disabled?: boolean
  className?: string
  /**
   * Label overlay for the composer. Workspace documents omit it (the root payload
   * supplies the table); public documents pass the table the lazy wrapper loaded.
   */
  labels?: InklingLabelsInput
}

/** An unparseable seed falls back to the empty state instead of crashing the composer;
 *  legacy math cards ride the fence downgrade so they open as editable ```math blocks. */
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
          // An empty fragment, not `placeholderText=""`: the latter still mounts
          // inkling's absolutely positioned placeholder div.
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
