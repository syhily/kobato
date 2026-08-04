import type { LexicalCommentBody } from '@kobato/shared/lexical/comment-schema'

import { COMMENT_LEXICAL_SLASH_COMMANDS } from '@kobato/editor/comments-editor/lexical/comment-lexical-slash-commands'
import { LexicalCommentEditorHint } from '@kobato/editor/comments-editor/lexical/LexicalCommentEditorHint'
import { LexicalCommentToolbar } from '@kobato/editor/comments-editor/lexical/LexicalCommentToolbar'
import { LexicalHistoryPlugin } from '@kobato/editor/engine/lexical/history'
import { registerLinkCommands } from '@kobato/editor/engine/lexical/link-commands'
import { registerMathInputRules } from '@kobato/editor/engine/lexical/math-input-rules'
import { LexicalSlashMenuPlugin } from '@kobato/editor/engine/lexical/slash-menu'
import { cn } from '@kobato/editor/lib/cn'
import { canonicalizeLexicalCommentBodyShape } from '@kobato/shared/lexical/comment-canonicalize'
import { COMMENT_EDITOR_NAMESPACE, createCommentEditorConfig } from '@kobato/shared/lexical/comment-config'
import { isEmptyLexicalCommentBody } from '@kobato/shared/lexical/comment-schema'
import { unsafeCast } from '@kobato/shared/utils/unsafe-cast'
import { registerList } from '@lexical/list'
// Side effect: register the decorator-node views (inline-math / math-block)
// into the shared node-view registry so `decorate()` renders in-editor.
import '@kobato/editor/engine/lexical/node-views/register-comment-node-views'
import { LexicalComposer, type InitialConfigType } from '@lexical/react/LexicalComposer'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { ContentEditable } from '@lexical/react/LexicalContentEditable'
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary'
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin'
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin'
import { useEffect, useRef, useState } from 'react'

// Comment body editor — the Lexical engine on the comment node subset
// (see `@kobato/shared/lexical/comment-schema` and
// `@kobato/shared/lexical/comment-config`). Mirrors the tiptap
// `CommentBodyEditor` contract field for field (same props, same empty /
// placeholder / disabled semantics, same wrapper chrome), so the ui
// consumers can swap imports at R6 without changing their call sites.
//
// Data flow:
//   - load: `initialBody` is canonicalized ONCE (deterministic 0.45.0
//     shape via the comment node registry); `bodyKey` changes reload
//     from `initialBody` and report the canonical body to the host.
//   - change: `OnChangePlugin` canonicalizes `editorState.toJSON()` per
//     update and reports it — no footnote logic (comments carry no
//     footnote registry).
//   - chrome: `LexicalCommentToolbar` (focus-revealed, tiptap parity),
//     `LexicalSlashMenuPlugin` with the 6-command comment catalogue,
//     the `$…$` math input rules and the list / link command
//     registrations.
//   - read-only: `disabled` toggles `editor.setEditable`.
//   - placeholder: an empty document (all-empty paragraphs) marks the
//     contenteditable `is-editor-empty`; the host CSS renders the
//     `data-placeholder` text via a `::before` pseudo element.

export interface LexicalCommentEditorProps {
  /** Initial Lexical comment body. Read on first mount + when `bodyKey` changes. */
  initialBody: LexicalCommentBody
  /**
   * Identity of the body source — when this string changes the editor
   * resets its content from `initialBody` (e.g. reply form reset,
   * switching comment).
   */
  bodyKey: string
  /** Fired on every editor update with the freshly-derived canonical body. */
  onBodyChange: (body: LexicalCommentBody) => void
  /** When true, the editor becomes read-only. */
  disabled?: boolean
  /** Override the placeholder copy. */
  placeholder?: string
  /** Extra Tailwind classes applied to the editor wrapper. */
  className?: string
}

const DEFAULT_PLACEHOLDER = '写下你的评论…  / 命令，$ 公式'

/** The canonical empty document — the shape an empty body canonicalizes to. */
function emptyCommentBody(): LexicalCommentBody {
  return {
    root: {
      direction: null,
      format: '',
      indent: 0,
      version: 1,
      type: 'root',
      children: [
        {
          direction: null,
          format: '',
          indent: 0,
          version: 1,
          type: 'paragraph',
          textFormat: 0,
          textStyle: '',
          children: [],
        },
      ],
    },
  }
}

/** Canonicalize a body for editor consumption; invalid or empty input degrades to the empty document. */
function loadCommentBody(body: LexicalCommentBody): LexicalCommentBody {
  try {
    const canonical = canonicalizeLexicalCommentBodyShape(body)
    // Lexical requires the root to hold at least one block — an empty
    // root (or one whose blocks are all empty paragraphs) normalizes to
    // the single-empty-paragraph document.
    return isEmptyLexicalCommentBody(canonical) ? emptyCommentBody() : canonical
  } catch {
    return emptyCommentBody()
  }
}

export function LexicalCommentEditor({
  initialBody,
  bodyKey,
  onBodyChange,
  disabled,
  placeholder,
  className,
}: LexicalCommentEditorProps) {
  // Canonicalize once at mount — `LexicalComposer` only reads
  // `initialConfig` on first render. Body-key reloads re-derive from
  // `initialBody` inside `CommentEditorInner`.
  const [initialConfig] = useState<InitialConfigType>(() => {
    const canonical = loadCommentBody(initialBody)
    return {
      ...createCommentEditorConfig(),
      namespace: COMMENT_EDITOR_NAMESPACE,
      editorState: JSON.stringify(canonical),
      // Keep errors loud — a broken editor must never silently swallow state.
      onError: (error) => {
        throw error
      },
    }
  })

  return (
    <div
      className={cn(
        'group/comment-editor',
        'rounded-md border border-line bg-background',
        'focus-within:border-brand focus-within:ring-1 focus-within:ring-brand/40',
        className,
      )}
    >
      <LexicalComposer initialConfig={initialConfig}>
        <CommentEditorInner
          initialBody={initialBody}
          bodyKey={bodyKey}
          onBodyChange={onBodyChange}
          disabled={disabled}
          placeholder={placeholder}
        />
      </LexicalComposer>
    </div>
  )
}

function CommentEditorInner({ initialBody, bodyKey, onBodyChange, disabled, placeholder }: LexicalCommentEditorProps) {
  const [editor] = useLexicalComposerContext()

  const onBodyChangeRef = useRef(onBodyChange)
  useEffect(() => {
    onBodyChangeRef.current = onBodyChange
  })

  // --- bodyKey reload ----------------------------------------------------------
  const lastBodyKey = useRef<string | null>(null)
  // The initialConfig already loaded the first body — the reset effect
  // must skip the very first run, or the re-parse would clone every
  // decorator node (new keys) and leave the old DOM behind.
  const firstRunDone = useRef(false)
  useEffect(() => {
    if (editor === null) {
      return
    }
    if (lastBodyKey.current === bodyKey) {
      return
    }
    lastBodyKey.current = bodyKey
    const canonical = loadCommentBody(initialBody)
    if (firstRunDone.current) {
      editor.setEditorState(editor.parseEditorState(JSON.stringify(canonical)))
    }
    firstRunDone.current = true
    // Report the canonical body on reset — same semantics as
    // `CommentBodyEditor`'s bodyKey effect.
    onBodyChangeRef.current(canonical)
  }, [editor, bodyKey, initialBody])

  // --- read-only ----------------------------------------------------------------
  useEffect(() => {
    editor.setEditable(disabled !== true)
  }, [editor, disabled])

  // --- commands -----------------------------------------------------------------
  useEffect(() => {
    const unregisterList = registerList(editor)
    const unregisterLink = registerLinkCommands(editor)
    const unregisterMath = registerMathInputRules(editor)
    return () => {
      unregisterList()
      unregisterLink()
      unregisterMath()
    }
  }, [editor])

  // --- placeholder ---------------------------------------------------------------
  const [isEmpty, setIsEmpty] = useState(() => isEmptyLexicalCommentBody(initialBody))
  useEffect(() => {
    return editor.registerUpdateListener(() => {
      setIsEmpty(isEmptyLexicalCommentBody(unsafeCast<LexicalCommentBody>(editor.getEditorState().toJSON())))
    })
  }, [editor])

  const placeholderText = placeholder ?? DEFAULT_PLACEHOLDER

  return (
    <>
      {editor !== null && <LexicalCommentToolbar editor={editor} disabled={disabled === true} />}
      <div
        className={cn(
          'prose-blog prose prose-sm max-w-none px-3 py-2',
          'min-h-[6rem]',
          'wrap-break-word whitespace-normal',
        )}
      >
        <RichTextPlugin
          contentEditable={
            <ContentEditable
              placeholder={null}
              data-placeholder={placeholderText}
              className={cn(
                'min-h-[5rem] outline-none',
                '[&>:first-child]:mt-0 [&>:last-child]:mb-0',
                // Placeholder rendering — the same `::before` mechanism
                // as the body editor's `is-editor-empty` style.
                isEmpty &&
                  'is-editor-empty [&::before]:pointer-events-none [&::before]:float-left [&::before]:h-0 [&::before]:text-muted-foreground [&::before]:content-[attr(data-placeholder)]',
              )}
            />
          }
          placeholder={null}
          ErrorBoundary={LexicalErrorBoundary}
        />
        <LexicalHistoryPlugin />
        <LexicalSlashMenuPlugin commands={COMMENT_LEXICAL_SLASH_COMMANDS} />
        <OnChangePlugin
          ignoreSelectionChange
          // Consecutive keystrokes carry the history-merge tag; the
          // default skips them, which would drop mid-burst reports —
          // same choice as the body editor.
          ignoreHistoryMergeTagChange={false}
          onChange={(editorState) => {
            try {
              onBodyChangeRef.current(
                canonicalizeLexicalCommentBodyShape(unsafeCast<LexicalCommentBody>(editorState.toJSON())),
              )
            } catch {
              // A transient mid-edit state that fails the dialect gate —
              // skip the report; the next keystroke converges.
            }
          }}
        />
      </div>
      <LexicalCommentEditorHint />
    </>
  )
}
