import type { JSONContent } from '@tiptap/core'

import Focus from '@tiptap/extension-focus'
import Link from '@tiptap/extension-link'
import Placeholder from '@tiptap/extension-placeholder'
import { Table, TableCell, TableHeader, TableRow } from '@tiptap/extension-table'
import TextAlign from '@tiptap/extension-text-align'
import Typography from '@tiptap/extension-typography'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { useCallback, useEffect, useRef, useState } from 'react'

import type { PortableTextBody } from '@/shared/pt/schema'

import { useMediumZoom } from '@/client/hooks/use-medium-zoom'
import { bodyToPmDoc } from '@/shared/pt/bridge/pt-to-pm'
import { stripFootnoteDefinitionsForEditor } from '@/shared/pt/footnote-merge'
import { validatePortableTextBody } from '@/shared/pt/utils'
import { FootnoteEditorDialog } from '@/ui/admin/editor/FootnoteEditorDialog'
import { ImageLibraryPicker } from '@/ui/admin/editor/pickers/ImageLibraryPicker'
import { MusicPickerDialog } from '@/ui/admin/editor/pickers/MusicPickerDialog'
import { BlockCardNode } from '@/ui/admin/editor/tiptap/BlockCardNode'
import { PageBubbleMenu } from '@/ui/admin/editor/tiptap/BubbleMenu'
import { CodeBlockBubbleMenu } from '@/ui/admin/editor/tiptap/CodeBlockBubbleMenu'
import { EditorActionsExtension } from '@/ui/admin/editor/tiptap/editor-actions'
import { FootnoteCaretTriggerExtension } from '@/ui/admin/editor/tiptap/footnote-caret-trigger'
import { ImageNode } from '@/ui/admin/editor/tiptap/ImageNode'
import { FootnoteRefMark, MathInlineMark } from '@/ui/admin/editor/tiptap/InlineMarks'
import { SlashCommandsExtension } from '@/ui/admin/editor/tiptap/SlashMenu'
import { SolutionNode } from '@/ui/admin/editor/tiptap/SolutionNode'
import { TableCellGuardExtension } from '@/ui/admin/editor/tiptap/table-cell-guard'
import { TableBubbleMenu } from '@/ui/admin/editor/tiptap/TableBubbleMenu'
import { TwoColumnNode, TwoColumnPaneNode } from '@/ui/admin/editor/tiptap/TwoColumnNode'
import { useEditorFootnotes } from '@/ui/admin/editor/tiptap/use-editor-footnotes'
import { useToolbarDensityPreference } from '@/ui/admin/editor/toolbar/density'
import { Toolbar } from '@/ui/admin/editor/toolbar/Toolbar'
import { useEditorPickers } from '@/ui/admin/editor/use-editor-pickers'
import {
  useMathInlineClickEditorRef,
  useOpenFootnoteEditDialogRef,
  useTiptapEditorProps,
} from '@/ui/admin/editor/use-editor-props'
import { cn } from '@/ui/lib/cn'

export interface PageBodyEditorProps {
  /** Initial PortableText body. Only read on first mount + when `bodyKey` changes. */
  initialBody: PortableTextBody
  /**
   * Identity of the body source. When this string changes the editor
   * resets its content from `initialBody`. Use the page id +
   * `clientRevisionToken` so opening a different page (or accepting a
   * remote revision in the conflict resolver) flushes stale content.
   */
  bodyKey: string
  /** Fired on every editor update with the freshly-derived PortableText body. */
  onBodyChange: (body: PortableTextBody) => void
  /** When true, the editor becomes read-only. */
  disabled?: boolean
  /**
   * Live preview column layout: keep the formatting toolbar fixed above
   * the scrollable canvas. When false, the toolbar starts inline at the
   * top of the scroll stack and a floating duplicate appears at the
   * bottom center after it scrolls out of view.
   */
  livePreviewOpen?: boolean
  /**
   * Ref to the scrollable container so the parent shell can wire
   * bidirectional scroll sync with the live-preview pane.
   */
  scrollContainerRef?: React.RefObject<HTMLDivElement | null>
  /**
   * Action(s) rendered to the right of the floating editor toolbar
   * (the duplicate that pins to the bottom-center once the inline
   * toolbar has scrolled off-screen). Useful for shell-level controls
   * like 发布草稿 that should stay reachable while the operator is
   * deep in the body. Pass `null` to hide. Renders nothing when the
   * floating toolbar itself isn't visible (live-preview mode, or
   * before the operator has scrolled).
   */
  floatingActions?: React.ReactNode
}

export function PageBodyEditor({
  initialBody,
  bodyKey,
  onBodyChange,
  disabled,
  livePreviewOpen = false,
  scrollContainerRef,
  floatingActions,
}: PageBodyEditorProps) {
  const onBodyChangeRef = useRef(onBodyChange)
  onBodyChangeRef.current = onBodyChange

  const editorZoomContainerRef = useRef<HTMLDivElement>(null)
  useMediumZoom(editorZoomContainerRef)

  const mathInlineClickEditorRef = useMathInlineClickEditorRef()
  const openFootnoteEditDialogRef = useOpenFootnoteEditDialogRef()
  const tiptapEditorProps = useTiptapEditorProps(mathInlineClickEditorRef, openFootnoteEditDialogRef)

  const editor = useEditor({
    immediatelyRender: false,
    editable: disabled !== true,
    editorProps: tiptapEditorProps,
    extensions: [
      StarterKit.configure({
        link: false,
        dropcursor: { color: 'var(--brand)', width: 2 },
      }),
      Typography,
      TextAlign.configure({ types: ['heading', 'paragraph', 'blockquote'] }),
      Focus.configure({ className: 'tiptap-focus-node', mode: 'all' }),
      Link.configure({
        openOnClick: false,
        autolink: true,
        HTMLAttributes: { class: null, target: null, rel: null },
      }),
      Placeholder.configure({
        placeholder: '在此处开始编写内容…（/ 命令菜单，^ 空格插入脚注）',
      }),
      Table.configure({
        resizable: false,
        View: null,
        HTMLAttributes: { class: 'pt-table' },
      }),
      TableRow,
      TableHeader,
      TableCell,
      ImageNode,
      TwoColumnPaneNode,
      TwoColumnNode,
      SolutionNode,
      BlockCardNode,
      MathInlineMark,
      FootnoteRefMark,
      FootnoteCaretTriggerExtension,
      SlashCommandsExtension,
      EditorActionsExtension,
      TableCellGuardExtension,
    ],
    content: bodyToPmDoc(stripFootnoteDefinitionsForEditor(validatePortableTextBody(initialBody))) as JSONContent,
    onUpdate({ editor: instance }) {
      const merged = footnotes.handleEditorUpdate(instance)
      onBodyChangeRef.current(merged)
    },
  })

  const footnotes = useEditorFootnotes(editor)
  openFootnoteEditDialogRef.current = footnotes.openEditDialog

  const confirmFootnoteDialog = useCallback(
    (plainText: string) => {
      const merged = footnotes.insertFootnote(plainText)
      if (merged !== null) {
        onBodyChangeRef.current(merged)
      }
    },
    [footnotes],
  )

  const deleteFootnoteFromDialog = useCallback(() => {
    const targetKey = footnotes.editTargetKey
    if (targetKey === null) {
      return
    }
    const merged = footnotes.removeFootnote(targetKey)
    if (merged !== null) {
      onBodyChangeRef.current(merged)
    }
  }, [footnotes])

  useEffect(() => {
    mathInlineClickEditorRef.current = editor
    return () => {
      if (mathInlineClickEditorRef.current === editor) {
        mathInlineClickEditorRef.current = null
      }
    }
  }, [editor, mathInlineClickEditorRef])

  const lastResetKey = useRef<string | null>(null)
  useEffect(() => {
    if (editor === null) {
      return
    }
    if (lastResetKey.current === bodyKey) {
      return
    }
    lastResetKey.current = bodyKey
    const mergedCanon = footnotes.resetFootnotes(initialBody)
    onBodyChangeRef.current(mergedCanon)
  }, [editor, bodyKey, initialBody, footnotes])

  useEffect(() => {
    if (editor === null) {
      return
    }
    editor.setEditable(disabled !== true)
  }, [editor, disabled])

  const pickers = useEditorPickers(editor)

  useEffect(() => {
    if (editor === null) {
      return
    }
    const actions = editor.storage.editorActions
    if (actions === undefined) {
      return
    }
    actions.openImagePicker = () => pickers.setImagePickerOpen(true)
    actions.openMusicPicker = () => pickers.setMusicPickerOpen(true)
    actions.openFootnoteDialog = () => footnotes.openInsertDialog()
    return () => {
      actions.openImagePicker = undefined
      actions.openMusicPicker = undefined
      actions.openFootnoteDialog = undefined
    }
  }, [editor, footnotes, pickers])

  const [toolbarDensity, setToolbarDensity] = useToolbarDensityPreference()

  const inlineToolbarRef = useRef<HTMLDivElement>(null)
  const [showFloatingToolbar, setShowFloatingToolbar] = useState(false)

  useEffect(() => {
    if (editor === null || livePreviewOpen) {
      setShowFloatingToolbar(false)
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

  if (editor === null) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center rounded-xl border bg-card p-4 text-sm text-muted-foreground">
        编辑器正在加载…
      </div>
    )
  }

  const toolbarProps = {
    editor,
    disabled,
    density: toolbarDensity,
    onDensityChange: setToolbarDensity,
    onOpenImagePicker: () => pickers.setImagePickerOpen(true),
    onOpenMusicPicker: () => pickers.setMusicPickerOpen(true),
    onOpenFootnoteInsertDialog: footnotes.openInsertDialog,
  } as const

  const editorCanvas = (
    <div ref={editorZoomContainerRef}>
      <EditorContent
        editor={editor}
        className={cn(
          'post-content pt-body-editor prose-blog prose prose-lg max-w-none focus:outline-none',
          'min-h-editor-min [&_.ProseMirror]:min-h-editor-prose-min',
          '[&_.ProseMirror]:focus:outline-none',
          '[&_blockquote[data-pt-solution]]:relative [&_blockquote[data-pt-solution]]:my-4 [&_blockquote[data-pt-solution]]:border-l-4 [&_blockquote[data-pt-solution]]:border-brand/40 [&_blockquote[data-pt-solution]]:bg-muted/25 [&_blockquote[data-pt-solution]]:py-3 [&_blockquote[data-pt-solution]]:pl-4',
          '[&_[data-pt-two-column-pane]]:min-w-0 [&_[data-pt-two-column-pane]]:rounded-xl [&_[data-pt-two-column-pane]]:border [&_[data-pt-two-column-pane]]:border-dashed [&_[data-pt-two-column-pane]]:border-muted-foreground/45 [&_[data-pt-two-column-pane]]:bg-background/85 [&_[data-pt-two-column-pane]]:p-3',
          '[&_section[data-pt-two-column]]:relative [&_section[data-pt-two-column]]:my-5 [&_section[data-pt-two-column]]:grid [&_section[data-pt-two-column]]:gap-4 [&_section[data-pt-two-column]]:rounded-xl [&_section[data-pt-two-column]]:border-2 [&_section[data-pt-two-column]]:border-dashed [&_section[data-pt-two-column]]:border-border [&_section[data-pt-two-column]]:bg-muted/30 [&_section[data-pt-two-column]]:p-3 [&_section[data-pt-two-column]]:shadow-sm [&_section[data-pt-two-column]]:md:grid-cols-2',
          '[&_.ProseMirror_p.is-editor-empty:first-child::before]:text-muted-foreground',
          '[&_.ProseMirror_p.is-editor-empty:first-child::before]:content-[attr(data-placeholder)]',
          '[&_.ProseMirror_p.is-editor-empty:first-child::before]:pointer-events-none',
          '[&_.ProseMirror_p.is-editor-empty:first-child::before]:float-left',
          '[&_.ProseMirror_p.is-editor-empty:first-child::before]:h-0',
        )}
      />
    </div>
  )

  return (
    <div className="relative flex min-h-0 w-full min-w-0 flex-1 flex-col rounded-xl border bg-card">
      {livePreviewOpen ? (
        <>
          {/* Sticks to the top of the admin `<main>` scrollport; canvas
              scrolls in the sibling below. */}
          <div className="sticky top-0 z-20 shrink-0 border-b bg-card">
            <Toolbar {...toolbarProps} />
          </div>
          {/* Bottom padding (`pb-editor-pad-bottom`) gives the operator a generous
              scroll runway past the end of the document. Without it the
              last paragraph hugs the container edge, which leaves the
              slash menu (anchored below the caret) clipped or overlapped
              by the surrounding chrome when authoring near the bottom. */}
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
              <Toolbar {...toolbarProps} />
            </div>
            <div className="min-h-0 grow px-3 pt-6 pb-editor-pad-bottom md:px-6">{editorCanvas}</div>
          </div>
          {showFloatingToolbar ? (
            // Centered toolbar pill, anchored at the same `bottom-*`
            // offset as the publish FAB column. `right-{n}` reserves
            // room for that column so the pill never crashes into it
            // on narrow phones — the toolbar shrinks (via the inner
            // `overflow-x-auto`) instead of stretching past the FABs.
            // The publish FAB now lives in its own fixed slot below
            // (see the sibling block) so the pill width can change
            // freely with density without dragging the publish button
            // sideways — addresses the "publish icon drifts when the
            // toolbar expands" complaint.
            <div className="pointer-events-none fixed right-20 bottom-6 left-0 z-40 flex touch-manipulation items-center justify-center px-3 sm:right-24 sm:bottom-8 lg:right-28">
              <div className="pointer-events-auto max-w-full overflow-x-auto rounded-xl border bg-card/95 p-1 shadow-lg ring-1 ring-border/60 backdrop-blur-sm supports-[backdrop-filter]:bg-card/90">
                <Toolbar {...toolbarProps} className="border-b-0" />
              </div>
            </div>
          ) : null}
          {showFloatingToolbar && floatingActions ? (
            // Publish FAB column anchored bottom-right, independent of
            // the centered toolbar pill. Sitting at the same `bottom-*`
            // tier as the toolbar means the two stay visually paired
            // on a single row, but the FAB never moves horizontally as
            // toolbar density changes. `AdminScrollTopButton` lifts
            // itself one row higher in focused mode so the scroll-to-
            // top FAB sits directly above this slot rather than
            // crashing into the centered toolbar pill. Tied to the
            // same `showFloatingToolbar` gate as the toolbar pill so
            // the FAB only surfaces once the inline header toolbar
            // of view.
            <div className="pointer-events-auto fixed right-4 bottom-6 z-40 touch-manipulation sm:bottom-8 lg:right-6">
              {floatingActions}
            </div>
          ) : null}
        </>
      )}
      <ImageLibraryPicker
        open={pickers.imagePickerOpen}
        onOpenChange={pickers.setImagePickerOpen}
        onPick={pickers.insertImage}
      />
      <MusicPickerDialog
        open={pickers.musicPickerOpen}
        onOpenChange={pickers.setMusicPickerOpen}
        onPick={pickers.insertMusic}
      />
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
