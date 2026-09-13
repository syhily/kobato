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
// Statically imported by every consumer (no lazy boundary): the editor code
// rides the route's module graph, so the SSR warmup emits it as a critical
// modulepreload and the chunk arrives with the page — clicking into the
// comment box never waits on a second fetch waterfall.
//
// SSR: the inkling tree renders during SSR/hydration directly (no
// `useHydrated` gate) — the empty-seed markup is deterministic, and gating
// would leave a dead skeleton that swallows clicks until hydration of the
// whole page finishes (the comments stream + root hydration take seconds).
// Rendering in place lets React's selective hydration prioritise this
// boundary on the first click and replay the click; the shell's onClick then
// focuses the editor programmatically, because a replayed (untrusted)
// mousedown never runs the browser's native focus-the-contenteditable
// default action.

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
