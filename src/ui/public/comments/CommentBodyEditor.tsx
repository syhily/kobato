// The comment body editor (R12, plan docs/plans/inkling-editor-replacement.md):
// the tiptap micro-app is replaced by a trimmed inkling surface —
// `InklingComposer` + `InklingSurface` mounting the COMMENT node set
// (`@/client/editor/comment-editor-nodes`) with only the list feature plugin.
// kobato glue lives under `@/client/editor/`: the node set, the markdown
// shortcuts (`comment-markdown-transformers` — bold/italic/quote/list/link
// and the ``` fence; ```math is the formula path, rendered to KaTeX MathML
// by the server-side comment projection), the zh-CN labels, and the legacy
// math-card seed downgrade (`comment-legacy-math`), plus the glue shared with
// the page surface (`block-quote-aside-cycle`, `use-editor-body-reset`).
// No cards on this surface: no slash menu, no card insert, no card config.
//
// The surface is deliberately minimal: `isEmojiEnabled={false}` keeps the
// emoji typeahead (and its lazy emoji-mart chunk) out of nested/caption
// editors, and `codeEditor="plain"` edits code blocks in a static textarea —
// the CodeMirror chunk is never fetched here; rendered comments keep their
// shiki highlighting from the server-side content projection.
//
// Loaded ONLY through `./LazyCommentBodyEditor` (all six consumers): this
// module, the inkling island, and `inkling-comment-editor.css` ride a lazy
// chunk, keeping the public post page's static import graph editor-free. The
// always-visible reply form is interaction-gated (placeholder → pointerdown/
// focus activates, hover prefetches); the edit forms and admin dialogs pass
// `eager` — the click that opened them was already the interaction.
//
// SSR: the server and the client's first render both render the wrapper's
// placeholder shell, so hydration is byte-stable and the chunk only ships to
// visitors who actually engage the composer (the R12 static-import tradeoff —
// "no waterfall on click" — is preserved via hover prefetch + focus handoff).

import '@/styles/inkling-comment-editor.css'
import { useCallback, useState } from 'react'

import type { ExternalControlAPI, LexicalEditor } from '@/inkling'
import type { CommentEditorState } from '@/shared/lexical/comment-schema'

import { blockQuoteAsideCycle } from '@/client/editor/block-quote-aside-cycle'
import { COMMENT_EDITOR_NODES } from '@/client/editor/comment-editor-nodes'
import { downgradeLegacyCommentMath } from '@/client/editor/comment-legacy-math'
import { COMMENT_MARKDOWN_TRANSFORMERS } from '@/client/editor/comment-markdown-transformers'
import { inklingLabels } from '@/client/editor/inkling-labels'
import { useEditorBodyReset } from '@/client/editor/use-editor-body-reset'
import { InklingComposer, InklingSurface, ListPlugin } from '@/inkling'
import { EMPTY_COMMENT_EDITOR_STATE, safeValidateCommentEditorState } from '@/shared/lexical/comment-schema'
import { cn } from '@/ui/lib/cn'
import { useTheme } from '@/ui/lib/ThemeProvider'

export interface CommentBodyEditorProps {
  /** Initial comment state. Read on first mount + when `bodyKey` changes. */
  initialBody: CommentEditorState
  /** Identity of the body source — when it changes the editor resets its content
   *  from `initialBody` (reply form reset, switching comment). */
  bodyKey: string
  /** Fired on every editor update with the freshly-serialized comment state. */
  onBodyChange: (body: CommentEditorState) => void
  /** When true, the editor becomes read-only. */
  disabled?: boolean
  /** Extra Tailwind classes applied to the editor shell. */
  className?: string
}

/** Rows stored before the Lexical switch still read back as PortableText
 *  during the interregnum — an unparseable seed falls back to the empty
 *  state instead of crashing the composer (the tiptap era's safeBodyToPmDoc
 *  behaviour). R12-era math cards ride the fence downgrade so they open as
 *  editable ```math code blocks. */
function safeInitialState(body: CommentEditorState): CommentEditorState {
  const result = safeValidateCommentEditorState(body)
  return result.ok ? downgradeLegacyCommentMath(result.state) : EMPTY_COMMENT_EDITOR_STATE
}

export function CommentBodyEditor({ initialBody, bodyKey, onBodyChange, disabled, className }: CommentBodyEditorProps) {
  const { resolvedTheme } = useTheme()

  const [editorInstance, setEditorInstance] = useState<LexicalEditor | null>(null)
  const registerAPI = useCallback((api: ExternalControlAPI | null) => {
    setEditorInstance(api?.editorInstance ?? null)
  }, [])

  const { mountedInitialState, handleChange } = useEditorBodyReset(
    editorInstance,
    initialBody,
    bodyKey,
    onBodyChange,
    safeInitialState,
  )

  // Click-to-focus fallback. The canvas now fills the shell (the host CSS
  // puts the min-height/padding on the contentEditable), so this only fires
  // for residual non-editable hits — and, critically, for a click React's
  // selective hydration captured before this boundary hydrated and replays
  // afterwards: the replayed untrusted mousedown never focuses the
  // contenteditable natively, but the replayed click DOES run this handler.
  // Skipped when the editor already owns focus so an in-editor click's caret
  // placement is never disturbed.
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
      <InklingComposer
        nodes={COMMENT_EDITOR_NODES}
        initialEditorState={mountedInitialState}
        labels={inklingLabels}
        darkMode={resolvedTheme === 'dark'}
        isEmojiEnabled={false}
        codeEditor="plain"
      >
        <InklingSurface
          readOnly={disabled === true}
          onChange={handleChange}
          registerAPI={registerAPI}
          // No placeholder on this surface — an empty fragment beats
          // `placeholderText=""` (which still mounts inkling's absolutely
          // positioned placeholder div).
          placeholder={<></>}
          contentEditableClassName="typeset typeset-comment"
          markdownTransformers={COMMENT_MARKDOWN_TRANSFORMERS}
          isSnippetsEnabled={false}
          isDragEnabled={false}
        >
          <ListPlugin />
        </InklingSurface>
      </InklingComposer>
    </div>
  )
}
