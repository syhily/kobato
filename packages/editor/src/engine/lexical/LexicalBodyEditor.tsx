import type { BodyEditorProps } from '@kobato/editor/engine/body-editor-types'
import type { LexicalBody } from '@kobato/shared/lexical/schema'

import { FootnoteEditorDialog } from '@kobato/editor/engine/FootnoteEditorDialog'
import { CodeBlockBubbleMenu, PageBubbleMenu, TableBubbleMenu } from '@kobato/editor/engine/lexical/bubble-menus'
import {
  INSERT_IMAGE_COMMAND,
  INSERT_MUSIC_COMMAND,
  INSERT_HORIZONTAL_RULE_COMMAND,
} from '@kobato/editor/engine/lexical/commands'
import { registerFootnoteCaretTrigger } from '@kobato/editor/engine/lexical/footnote-caret-trigger'
import { registerFootnoteHandlers } from '@kobato/editor/engine/lexical/footnote-registry'
import { LexicalHistoryPlugin } from '@kobato/editor/engine/lexical/history'
import { LexicalToolbar } from '@kobato/editor/engine/lexical/LexicalToolbar'
import { registerLinkCommands } from '@kobato/editor/engine/lexical/link-commands'
import { registerMathInputRules } from '@kobato/editor/engine/lexical/math-input-rules'
import { registerPickerHandlers } from '@kobato/editor/engine/lexical/picker-registry'
import { LexicalSlashMenuPlugin } from '@kobato/editor/engine/lexical/slash-menu'
import { useLexicalFootnotes } from '@kobato/editor/engine/lexical/use-lexical-footnotes'
import { cn } from '@kobato/editor/engine/lib/cn'
import { useToolbarDensityPreference } from '@kobato/editor/engine/toolbar/density'
import { canonicalizeLexicalBodyShape } from '@kobato/editor/lexical-core/canonicalize'
import { BODY_EDITOR_NAMESPACE, createBodyEditorConfig } from '@kobato/editor/lexical-core/create-body-editor-config'
import { $createHorizontalRuleNode } from '@kobato/editor/lexical-core/nodes/horizontal-rule-node'
import { $createImageNode } from '@kobato/editor/lexical-core/nodes/image-node'
import { $createMusicPlayerNode } from '@kobato/editor/lexical-core/nodes/music-player-node'
import { isEmptyLexicalBody } from '@kobato/editor/lexical-core/validate'
import { transformAutoLinkToLinkBody } from '@kobato/shared/lexical/autolink-transform'
import { stripFootnoteDefinitionsForEditorLexical } from '@kobato/shared/lexical/footnote-merge-lexical'
import { unsafeCast } from '@kobato/shared/utils/unsafe-cast'
import { createLinkMatcherWithRegExp } from '@lexical/link'
import { registerList } from '@lexical/list'
import { AutoLinkPlugin } from '@lexical/react/LexicalAutoLinkPlugin'
import { LexicalComposer, type InitialConfigType } from '@lexical/react/LexicalComposer'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { ContentEditable } from '@lexical/react/LexicalContentEditable'
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary'
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin'
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin'
import { TablePlugin } from '@lexical/react/LexicalTablePlugin'
import { $insertNodeToNearestRoot } from '@lexical/utils'
import { $getSelection, $isRangeSelection, COMMAND_PRIORITY_EDITOR } from 'lexical'
import { useEffect, useRef, useState } from 'react'

// Lexical body editor — the R3a kernel + the R3b chrome (toolbar, slash
// menu, floating bubbles, footnote loop, math input rules). Implements the
// shared `BodyEditorProps<LexicalBody>` contract (see
// `engine/body-editor-types.ts`), so the host screen can swap it in for
// `PageBodyEditor` without changing its props shape.
//
// Data flow:
//   - load: `initialBody` is canonicalized ONCE (footnote renumbering +
//     deterministic 0.45.0 shape), its footnote DEFINITION blocks are
//     stripped into the footnote loop's parallel state (the editor
//     surface renders prose only — same strip semantics as the tiptap
//     engine), and the prose is parsed into the editor state;
//     `bodyKey` changes reload from `initialBody` and report the
//     canonical body (with definitions merged back) to the host.
//   - change: `OnChangePlugin` canonicalizes `editorState.toJSON()` per
//     update, the footnote loop merges the parallel definitions back at
//     the end and re-syncs the in-editor `<sup>` indices when the
//     citation order moved, then the canonical body is reported.
//   - chrome: `LexicalToolbar` (density + floating pill like the tiptap
//     engine), `LexicalSlashMenuPlugin` (16-command catalogue),
//     `PageBubbleMenu` / `TableBubbleMenu` / `CodeBlockBubbleMenu`,
//     the `FootnoteEditorDialog` loop, the `$…$` math input rules and
//     the `^ ` footnote caret trigger.
//   - read-only: `disabled` toggles `editor.setEditable`.
//   - placeholder: an empty document (all-empty paragraphs) marks the
//     contenteditable `is-editor-empty`; the host CSS renders the
//     `data-placeholder` text via a `::before` pseudo element (the same
//     mechanism as the tiptap engine).

export interface LexicalBodyEditorProps<TBody = LexicalBody> extends BodyEditorProps<TBody> {}

/** Placeholder text shown in an empty document. */
const EMPTY_DOCUMENT_PLACEHOLDER = '在此处开始编写内容…'

// Auto-link matcher: bare URLs typed into the document become AutoLinkNodes
// (`type: 'autolink'` in the serialized state) — the 0.45 `registerAutoLink`
// transform. The reported body rewrites them back to regular LinkNodes
// (`transformAutoLinkToLinkBody`, see the OnChange handler) so the wire dialect
// never sees the unadmitted type.
const AUTOLINK_URL_REGEX = /((https?:\/\/|www\.)[^\s<]+)/
const AUTOLINK_MATCHERS = [
  createLinkMatcherWithRegExp(AUTOLINK_URL_REGEX, (text) => (text.startsWith('http') ? text : `https://${text}`)),
]

/** The canonical empty document — the shape an empty body canonicalizes to. */
function emptyBody(): LexicalBody {
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
function loadBody(body: LexicalBody): LexicalBody {
  try {
    const canonical = canonicalizeLexicalBodyShape(body)
    // Lexical requires the root to hold at least one block — an empty
    // root (or one whose blocks are all empty paragraphs) normalizes to
    // the single-empty-paragraph document.
    return isEmptyLexicalBody(canonical) ? emptyBody() : canonical
  } catch {
    return emptyBody()
  }
}

export function LexicalBodyEditor<TBody = LexicalBody>(props: BodyEditorProps<TBody>) {
  // The kernel is Lexical-native; the generic contract exists so the host
  // can switch engines with one import swap. Runtime always receives a
  // `LexicalBody` (the default type argument), so the cast is structural.
  const {
    initialBody,
    bodyKey,
    onBodyChange,
    disabled,
    livePreviewOpen,
    scrollContainerRef,
    pickerRenderers,
    floatingActions,
  } = unsafeCast<BodyEditorProps<LexicalBody>>(props)

  // Canonicalize once at mount — `LexicalComposer` only reads
  // `initialConfig` on first render. Body-key reloads re-derive from
  // `initialBody` inside `BodyEditorInner`.
  const [initialConfig] = useState<InitialConfigType>(() => {
    const canonical = loadBody(initialBody)
    return {
      ...createBodyEditorConfig(),
      namespace: BODY_EDITOR_NAMESPACE,
      editorState: JSON.stringify(stripFootnoteDefinitionsForEditorLexical(canonical)),
      // Lexical's default for missing onError is a dev-mode throw; keep
      // errors loud — a broken editor must never silently swallow state.
      onError: (error) => {
        throw error
      },
    }
  })

  return (
    <div className="relative flex min-h-0 w-full min-w-0 flex-1 flex-col rounded-xl border bg-card">
      <LexicalComposer initialConfig={initialConfig}>
        <BodyEditorInner
          initialBody={initialBody}
          bodyKey={bodyKey}
          onBodyChange={onBodyChange}
          disabled={disabled}
          livePreviewOpen={livePreviewOpen === true}
          scrollContainerRef={scrollContainerRef}
          pickerRenderers={pickerRenderers}
          floatingActions={floatingActions}
        />
      </LexicalComposer>
    </div>
  )
}

function BodyEditorInner({
  initialBody,
  bodyKey,
  onBodyChange,
  disabled,
  livePreviewOpen,
  scrollContainerRef,
  pickerRenderers,
  floatingActions,
}: BodyEditorProps<LexicalBody> & { livePreviewOpen: boolean }) {
  const [editor] = useLexicalComposerContext()

  const onBodyChangeRef = useRef(onBodyChange)
  useEffect(() => {
    onBodyChangeRef.current = onBodyChange
  })

  const footnotes = useLexicalFootnotes(editor)

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
    const canonical = loadBody(initialBody)
    const prose = stripFootnoteDefinitionsForEditorLexical(canonical)
    if (firstRunDone.current) {
      editor.setEditorState(editor.parseEditorState(JSON.stringify(prose)))
    }
    firstRunDone.current = true
    // Report the canonical body (definitions merged back) on reset — same
    // semantics as `PageBodyEditor`'s bodyKey effect.
    onBodyChangeRef.current(footnotes.resetFootnotes(canonical))
  }, [editor, bodyKey, initialBody, footnotes])

  // --- read-only ----------------------------------------------------------------
  useEffect(() => {
    editor.setEditable(disabled !== true)
  }, [editor, disabled])

  // --- picker surface ------------------------------------------------------------
  const [imagePickerOpen, setImagePickerOpen] = useState(false)
  const [musicPickerOpen, setMusicPickerOpen] = useState(false)

  useEffect(() => {
    const unregister = registerPickerHandlers(editor, {
      openImagePicker: () => setImagePickerOpen(true),
      openMusicPicker: () => setMusicPickerOpen(true),
      renderImagePicker: pickerRenderers?.renderImagePicker,
      renderMusicPicker: pickerRenderers?.renderMusicPicker,
    })
    return unregister
  }, [editor, pickerRenderers])

  // --- footnote surface ------------------------------------------------------------
  useEffect(() => {
    return registerFootnoteHandlers(editor, {
      openInsertDialog: footnotes.openInsertDialog,
      openEditDialog: footnotes.openEditDialog,
    })
  }, [editor, footnotes])

  // --- commands & plugins ----------------------------------------------------------
  useEffect(() => {
    const unregisterImage = editor.registerCommand(
      INSERT_IMAGE_COMMAND,
      (image) => {
        editor.update(() => {
          const node = $createImageNode(image.publicUrl, {
            alt: image.note ?? '',
            width: image.width,
            height: image.height,
            thumbhash: image.thumbhash ?? undefined,
            storagePath: image.storagePath,
            imageId: image.id,
          })
          $insertNodeToNearestRoot(node)
        })
        return true
      },
      COMMAND_PRIORITY_EDITOR,
    )
    const unregisterMusic = editor.registerCommand(
      INSERT_MUSIC_COMMAND,
      (music) => {
        editor.update(() => {
          const node = $createMusicPlayerNode(music.playerId)
          $insertNodeToNearestRoot(node)
        })
        return true
      },
      COMMAND_PRIORITY_EDITOR,
    )
    const unregisterHr = editor.registerCommand(
      INSERT_HORIZONTAL_RULE_COMMAND,
      () => {
        editor.update(() => {
          const selection = $getSelection()
          if (!$isRangeSelection(selection)) {
            return
          }
          $insertNodeToNearestRoot($createHorizontalRuleNode())
        })
        return true
      },
      COMMAND_PRIORITY_EDITOR,
    )
    const unregisterList = registerList(editor)
    const unregisterLink = registerLinkCommands(editor)
    const unregisterMath = registerMathInputRules(editor)
    const unregisterFootnoteTrigger = registerFootnoteCaretTrigger(editor)
    return () => {
      unregisterImage()
      unregisterMusic()
      unregisterHr()
      unregisterList()
      unregisterLink()
      unregisterMath()
      unregisterFootnoteTrigger()
    }
  }, [editor])

  // --- footnote dialog --------------------------------------------------------------
  const confirmFootnoteDialog = (plainText: string) => {
    const merged = footnotes.insertFootnote(plainText)
    if (merged !== null) {
      onBodyChangeRef.current(merged)
    }
  }

  const deleteFootnoteFromDialog = () => {
    const targetKey = footnotes.editTargetKey
    if (targetKey === null) {
      return
    }
    const merged = footnotes.removeFootnote(targetKey)
    if (merged !== null) {
      onBodyChangeRef.current(merged)
    }
  }

  // --- placeholder ---------------------------------------------------------------
  const [isEmpty, setIsEmpty] = useState(() => isEmptyLexicalBody(initialBody))
  useEffect(() => {
    return editor.registerUpdateListener(() => {
      setIsEmpty(isEmptyLexicalBody(unsafeCast<LexicalBody>(editor.getEditorState().toJSON())))
    })
  }, [editor])

  const [toolbarDensity, setToolbarDensity] = useToolbarDensityPreference()

  const inlineToolbarRef = useRef<HTMLDivElement>(null)
  const [showFloatingToolbar, setShowFloatingToolbar] = useState(false)

  const [lastFloatInputs, setLastFloatInputs] = useState({
    editor,
    livePreviewOpen,
    bodyKey,
  })
  if (
    lastFloatInputs.editor !== editor ||
    lastFloatInputs.livePreviewOpen !== livePreviewOpen ||
    lastFloatInputs.bodyKey !== bodyKey
  ) {
    setLastFloatInputs({ editor, livePreviewOpen, bodyKey })
    if (editor === null || livePreviewOpen) {
      setShowFloatingToolbar(false)
    }
  }
  useEffect(() => {
    if (editor === null || livePreviewOpen) {
      return
    }
    const target = inlineToolbarRef.current
    if (target === null) {
      return
    }
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0]
        if (entry === undefined) {
          return
        }
        setShowFloatingToolbar(!entry.isIntersecting)
      },
      { root: null, rootMargin: '0px', threshold: 0 },
    )
    observer.observe(target)
    return () => observer.disconnect()
  }, [editor, livePreviewOpen, bodyKey])

  const toolbarProps = {
    editor,
    disabled,
    density: toolbarDensity,
    onDensityChange: setToolbarDensity,
  } as const

  const editorCanvas = (
    <div className="post-content pt-body-editor prose-blog prose prose-lg min-h-editor-min max-w-none focus:outline-none">
      <RichTextPlugin
        contentEditable={
          <ContentEditable
            placeholder={null}
            data-placeholder={EMPTY_DOCUMENT_PLACEHOLDER}
            className={cn(
              'min-h-editor-prose-min focus:outline-none',
              // Placeholder rendering — the same `::before` mechanism
              // as the tiptap engine's `is-editor-empty` style.
              isEmpty &&
                'is-editor-empty [&::before]:pointer-events-none [&::before]:float-left [&::before]:h-0 [&::before]:text-muted-foreground [&::before]:content-[attr(data-placeholder)]',
            )}
          />
        }
        placeholder={null}
        ErrorBoundary={LexicalErrorBoundary}
      />
      <LexicalHistoryPlugin />
      <TablePlugin />
      <LexicalSlashMenuPlugin />
      <AutoLinkPlugin matchers={AUTOLINK_MATCHERS} />
      <OnChangePlugin
        ignoreSelectionChange
        // The footnote index sync uses history-merge-tagged updates; those
        // must still reach the host (the default skips them).
        ignoreHistoryMergeTagChange={false}
        onChange={(editorState) => {
          try {
            // AutoLink nodes (`type: 'autolink'`) are rewritten to regular
            // links BEFORE the report — the wire dialect does not admit
            // the type (canonicalize runs the same transform on load).
            const withLinks = transformAutoLinkToLinkBody(unsafeCast<LexicalBody>(editorState.toJSON()))
            const merged = footnotes.handleEditorUpdate(withLinks)
            onBodyChangeRef.current(merged)
          } catch {
            // A transient mid-edit state that fails the dialect gate —
            // skip the report; the next keystroke converges.
          }
        }}
      />
    </div>
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {livePreviewOpen ? (
        <>
          {/* Sticks to the top of the admin `<main>` scrollport; canvas
              scrolls in the sibling below. */}
          <div className="sticky top-0 z-20 shrink-0 border-b bg-card">
            <LexicalToolbar {...toolbarProps} />
          </div>
          <div
            ref={scrollContainerRef}
            className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-3 pt-6 pb-editor-pad-bottom md:px-6"
          >
            {editorCanvas}
          </div>
        </>
      ) : (
        <>
          <div ref={scrollContainerRef} className="flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto">
            <div
              ref={inlineToolbarRef}
              className="shrink-0 border-b bg-card"
              inert={showFloatingToolbar ? true : undefined}
            >
              <LexicalToolbar {...toolbarProps} />
            </div>
            <div className="min-h-0 grow px-3 pt-6 pb-editor-pad-bottom md:px-6">{editorCanvas}</div>
          </div>
          {showFloatingToolbar ? (
            // Centered toolbar pill at the same `bottom-*` offset as the
            // publish FAB column (layout parity with the tiptap engine).
            <div className="pointer-events-none fixed right-20 bottom-6 left-0 z-40 flex touch-manipulation items-center justify-center px-3 sm:right-24 sm:bottom-8 lg:right-28">
              <div className="pointer-events-auto max-w-full overflow-x-auto rounded-xl border bg-card/95 p-1 shadow-lg ring-1 ring-border/60 backdrop-blur-sm supports-[backdrop-filter]:bg-card/90">
                <LexicalToolbar {...toolbarProps} className="border-b-0" />
              </div>
            </div>
          ) : null}
          {showFloatingToolbar && floatingActions ? (
            <div className="pointer-events-auto fixed right-4 bottom-6 z-40 touch-manipulation sm:bottom-8 lg:right-6">
              {floatingActions}
            </div>
          ) : null}
        </>
      )}
      {pickerRenderers?.renderImagePicker({
        open: imagePickerOpen,
        onOpenChange: setImagePickerOpen,
        onPick: (image) => {
          editor.dispatchCommand(INSERT_IMAGE_COMMAND, image)
        },
      })}
      {pickerRenderers?.renderMusicPicker({
        open: musicPickerOpen,
        onOpenChange: setMusicPickerOpen,
        onPick: (music) => {
          editor.dispatchCommand(INSERT_MUSIC_COMMAND, music)
        },
      })}
      <FootnoteEditorDialog
        open={footnotes.dialogOpen}
        onOpenChange={footnotes.setDialogOpen}
        mode={footnotes.dialogMode}
        initialPlainText={footnotes.dialogInitialText}
        onConfirm={confirmFootnoteDialog}
        onDelete={footnotes.dialogMode === 'edit' ? deleteFootnoteFromDialog : undefined}
      />
      <PageBubbleMenu editor={editor} />
      <TableBubbleMenu editor={editor} />
      <CodeBlockBubbleMenu editor={editor} />
    </div>
  )
}
