// The comment body editor (R12, plan docs/plans/inkling-editor-replacement.md):
// the tiptap micro-app is replaced by a trimmed inkling surface —
// `InklingComposer` + `InklingSurface` mounting the COMMENT node set
// (`@/client/editor/comment-editor-nodes`) with only the list / card-insert /
// slash-menu feature plugins. kobato glue lives under `@/client/editor/`:
// the node set, the filtered markdown shortcuts + `$…$` inline-math trigger
// (`comment-markdown-transformers`), the zh-CN labels, and the shared
// server-KaTeX preview channel (`renderMath`).
//
// SSR: this module mounts ONLY after hydration — the gate lives in
// `LazyCommentBodyEditor` (which every consumer imports), so the inkling
// tree never renders on the server.

import '@/styles/inkling-comment-editor.css'
import type { CardConfig, ExternalControlAPI, LexicalEditor, SerializedEditorState } from '@inkling/editor'

import { CardInsertPlugin, InklingComposer, InklingSurface, ListPlugin, SlashCardMenuPlugin } from '@inkling/editor'
import { useCallback, useEffect, useRef, useState } from 'react'

import type { CommentEditorState } from '@/shared/lexical/comment-schema'

import { COMMENT_EDITOR_NODES } from '@/client/editor/comment-editor-nodes'
import { COMMENT_MARKDOWN_TRANSFORMERS } from '@/client/editor/comment-markdown-transformers'
import { inklingLabels } from '@/client/editor/inkling-labels'
import { renderMath } from '@/client/editor/render-math'
import { EMPTY_COMMENT_EDITOR_STATE, safeValidateCommentEditorState } from '@/shared/lexical/comment-schema'
import { unsafeCast } from '@/shared/utils/unsafe-cast'
import { cn } from '@/ui/lib/cn'
import { useTheme } from '@/ui/lib/ThemeProvider'
import { CommentEditorHint } from '@/ui/public/comments/CommentEditorHint'

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
  /** Override the placeholder copy. */
  placeholder?: string
  /** Extra Tailwind classes applied to the editor shell. */
  className?: string
}

const DEFAULT_PLACEHOLDER = '写下你的评论…  / 命令，$ 公式'

// The comment surface mounts only the math family of cards, so the card
// config is exactly the KaTeX preview channel (the math card's edit dialog
// previews through it; the persisted mathml/svg artifacts are filled by the
// save pipeline, never written back).
const COMMENT_CARD_CONFIG: CardConfig = { renderMath }

/** Rows stored before the Lexical switch still read back as PortableText
 *  during the interregnum — an unparseable seed falls back to the empty
 *  state instead of crashing the composer (the tiptap era's safeBodyToPmDoc
 *  behaviour). */
function safeInitialState(body: CommentEditorState): CommentEditorState {
  const result = safeValidateCommentEditorState(body)
  return result.ok ? result.state : EMPTY_COMMENT_EDITOR_STATE
}

/** inkling's Ctrl+Q cycles paragraph → quote → aside; AsideNode is not
 *  registered in this composer (the comment whitelist rejects 'aside'), so
 *  the chord is captured on the wrapper before Lexical's KEY_DOWN dispatch
 *  (same interception as PageBodyEditor). */
function blockQuoteAsideCycle(event: React.KeyboardEvent) {
  if (event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey && event.code === 'KeyQ') {
    event.preventDefault()
    event.stopPropagation()
  }
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

  const { resolvedTheme } = useTheme()

  const [editorInstance, setEditorInstance] = useState<LexicalEditor | null>(null)
  const registerAPI = useCallback((api: ExternalControlAPI | null) => {
    setEditorInstance(api?.editorInstance ?? null)
  }, [])

  // Lexical consumes the initial state only at editor creation; the lazy
  // state pins the mount-time snapshot (later initialBody prop changes must
  // NOT recreate the composer). Re-seeding on a bodyKey change (reply form
  // reset, switching the edited comment) is imperative.
  const [mountedInitialState] = useState(() => safeInitialState(initialBody))
  const lastResetKeyRef = useRef(bodyKey)
  const initialBodyRef = useRef(initialBody)
  useEffect(() => {
    initialBodyRef.current = initialBody
  })
  useEffect(() => {
    if (editorInstance === null || lastResetKeyRef.current === bodyKey) {
      return
    }
    lastResetKeyRef.current = bodyKey
    editorInstance.setEditorState(editorInstance.parseEditorState(safeInitialState(initialBodyRef.current)))
  }, [editorInstance, bodyKey])

  const handleChange = useCallback((state: SerializedEditorState) => {
    // The one narrowing boundary: inkling hands the stock
    // SerializedEditorState; kobato's CommentEditorState is the same JSON
    // restricted to the comment whitelist, and the server re-validates on
    // save, so the per-keystroke path casts instead of zod-parsing.
    onBodyChangeRef.current(unsafeCast<CommentEditorState>(state))
  }, [])

  return (
    <div
      className={cn(
        'kobato-comment-editor group/comment-editor',
        'rounded-md border border-line bg-background',
        'focus-within:border-brand focus-within:ring-1 focus-within:ring-brand/40',
        className,
      )}
      onKeyDownCapture={blockQuoteAsideCycle}
    >
      <InklingComposer
        nodes={COMMENT_EDITOR_NODES}
        initialEditorState={mountedInitialState}
        labels={inklingLabels}
        darkMode={resolvedTheme === 'dark'}
        cardConfig={COMMENT_CARD_CONFIG}
      >
        <InklingSurface
          readOnly={disabled === true}
          onChange={handleChange}
          registerAPI={registerAPI}
          placeholderText={placeholder ?? DEFAULT_PLACEHOLDER}
          markdownTransformers={COMMENT_MARKDOWN_TRANSFORMERS}
          isSnippetsEnabled={false}
          isDragEnabled={false}
        >
          <ListPlugin />
          <CardInsertPlugin />
          <SlashCardMenuPlugin />
        </InklingSurface>
      </InklingComposer>
      <CommentEditorHint />
    </div>
  )
}
