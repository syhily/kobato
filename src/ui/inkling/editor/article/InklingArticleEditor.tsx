import type { InitialConfigType } from '@lexical/react/LexicalComposer'
import type { LexicalEditor, SerializedRootNode } from 'lexical'

import { LinkNode } from '@lexical/link'
import { ListItemNode, ListNode } from '@lexical/list'
import { AutoFocusPlugin } from '@lexical/react/LexicalAutoFocusPlugin'
import { LexicalComposer } from '@lexical/react/LexicalComposer'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { ContentEditable } from '@lexical/react/LexicalContentEditable'
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin'
import { HeadingNode, QuoteNode } from '@lexical/rich-text'
import { ParagraphNode } from 'lexical'
import { useEffect, useMemo, type RefObject } from 'react'

import type { InklingBlockNode, InklingDocument } from '@/shared/inkling/schema'
import type { InklingArticleEditorProps } from '@/ui/inkling/editor/article/article-editor-types'

import { InklingArticleEditorProvider } from '@/ui/inkling/editor/article/article-editor-context'
import { InlineMathNode } from '@/ui/inkling/editor/article/InlineMathNode'
import { registerInklingDocumentTransforms } from '@/ui/inkling/editor/behaviour/document-transforms'
import { InklingDragDropReorder } from '@/ui/inkling/editor/behaviour/DragDropReorderPlugin'
import { useInklingKeyboardNavigation } from '@/ui/inkling/editor/behaviour/keyboard-navigation'
import { SolutionCardNode, TwoColumnCardNode } from '@/ui/inkling/editor/cards/layout-card-nodes'
import {
  CodeCardNode,
  HorizontalRuleCardNode,
  ImageCardNode,
  MathCardNode,
  MusicCardNode,
  TableCardNode,
} from '@/ui/inkling/editor/cards/simple-card-nodes'
import { reportEditorError } from '@/ui/inkling/editor/error-report'
import { EditorErrorBoundary } from '@/ui/inkling/editor/ErrorBoundary'
import { FootnoteController } from '@/ui/inkling/editor/footnotes/FootnoteController'
import { FootnoteRefNode } from '@/ui/inkling/editor/footnotes/FootnoteRefNode'
import {
  InklingFootnoteProvider,
  type FootnoteDefinitionItem,
  useInklingFootnotes,
} from '@/ui/inkling/editor/footnotes/InklingFootnoteProvider'
import { InklingPlusMenuPlugin } from '@/ui/inkling/editor/menu/PlusMenu'
import { InklingSlashMenuPlugin } from '@/ui/inkling/editor/menu/SlashMenu'
import { SharedHistoryProvider, useSharedHistoryState } from '@/ui/inkling/editor/nested/SharedHistoryContext'
import { OnInklingDocumentChangePlugin } from '@/ui/inkling/editor/plugins/OnInklingDocumentChangePlugin'
import { PastePlugin } from '@/ui/inkling/editor/plugins/PastePlugin'
import { toSerializedRoot } from '@/ui/inkling/editor/shared/lexical-bridge'
import { FloatingFormatToolbar } from '@/ui/inkling/editor/toolbar/FloatingFormatToolbar'
import { FloatingLinkToolbar } from '@/ui/inkling/editor/toolbar/FloatingLinkToolbar'

const theme = {
  paragraph: 'inkling-paragraph',
  heading: { h1: 'inkling-h1', h2: 'inkling-h2', h3: 'inkling-h3', h4: 'inkling-h4' },
  list: { ul: 'inkling-ul', ol: 'inkling-ol' },
  link: 'inkling-link',
  quote: 'inkling-quote',
  code: 'inkling-code',
  text: {
    bold: 'inkling-text-bold',
    italic: 'inkling-text-italic',
    underline: 'inkling-text-underline',
    strikethrough: 'inkling-text-strikethrough',
    code: 'inkling-text-code',
  },
}

// Note: `FootnoteDefinitionNode` is intentionally NOT registered here. The
// article editor uses a parallel-state footnote model (§6.3): definitions
// live in `InklingFootnoteProvider` state, not in the Lexical tree. Only
// `FootnoteRefNode` (the inline superscript) appears in the editor. The
// `FootnoteDefinitionNode` class is retained for paste/importDOM fallback but
// is never mounted in the article editor, so any stray `footnote-definition`
// block that slips past the read-time strip is dropped rather than silently
// polluting the editable root.
const ARTICLE_NODES: InitialConfigType['nodes'] = [
  ParagraphNode,
  HeadingNode,
  QuoteNode,
  ListNode,
  ListItemNode,
  LinkNode,
  FootnoteRefNode,
  InlineMathNode,
  ImageCardNode,
  CodeCardNode,
  MathCardNode,
  MusicCardNode,
  HorizontalRuleCardNode,
  TableCardNode,
  SolutionCardNode,
  TwoColumnCardNode,
]

interface StrippedDocument {
  /** Root whose children contain only prose (no `footnote-definition` blocks). */
  proseRoot: SerializedRootNode
  /** Footnote definitions lifted out of the root, in source order. */
  definitions: FootnoteDefinitionItem[]
}

/**
 * Split an InklingDocument into a prose-only root + a parallel definitions
 * list. The prose root is what the editor parses; the definitions are handed
 * to `InklingFootnoteProvider` as the initial parallel state. At save time
 * `OnInklingDocumentChangePlugin` merges them back into the persisted shape.
 */
function stripFootnoteDefinitions(document: InklingDocument): StrippedDocument {
  const proseChildren: InklingBlockNode[] = []
  const definitions: FootnoteDefinitionItem[] = []
  for (const child of document.root.children) {
    if (child.type === 'footnote-definition') {
      definitions.push({
        targetKey: child.targetKey,
        index: child.index,
        // Clone the children so the provider owns its own copy.
        children: structuredClone(child.children),
      })
    } else {
      proseChildren.push(child)
    }
  }
  // Build a prose-only serialized root for the editor. We carry over the
  // metadata fields from the original root and override `children` with the
  // prose-only list. The cast mirrors `editorStateToInklingDocument` helpers
  // elsewhere: Inkling's root shape is structurally compatible with Lexical's
  // `SerializedRootNode`.
  const proseRoot = toSerializedRoot({ ...document.root, children: proseChildren })
  return { proseRoot, definitions }
}

export function InklingArticleEditor({
  initialDocument,
  documentKey,
  onDocumentChange,
  disabled,
  actions = {},
  editorRef: editorRefProp,
  livePreviewOpen = false,
  scrollContainerRef,
  floatingActions,
}: InklingArticleEditorProps) {
  // Strip footnote definitions once per `initialDocument` identity. The prose
  // root seeds the editor; the definitions seed the provider. Both derive
  // from the same memo so they never disagree.
  const { proseRoot, definitions: initialFootnoteDefinitions } = useMemo(
    () => stripFootnoteDefinitions(initialDocument),
    [initialDocument],
  )

  const initialConfig: InitialConfigType = useMemo(
    () => ({
      namespace: 'inkling-article-editor',
      theme,
      onError: (error: Error) => {
        reportEditorError(error, 'article')
      },
      nodes: ARTICLE_NODES,
      editable: disabled !== true,
      editorState: (editor: LexicalEditor) => {
        editor.setEditorState(editor.parseEditorState({ root: proseRoot }))
      },
    }),
    [disabled, proseRoot],
  )

  return (
    <InklingArticleEditorProvider actions={actions}>
      <SharedHistoryProvider>
        {/* `key={documentKey}` remounts the provider alongside the composer so
            its parallel footnote-definition state resets when the body source
            changes. Without this the provider would carry the previous
            document's definitions into the new edit session. */}
        <InklingFootnoteProvider key={documentKey} initialDefinitions={initialFootnoteDefinitions}>
          {/* `key={documentKey}` forces LexicalComposer to remount when the
              body source identity changes (e.g. adopting a server revision
              from DraftConflictDialog or RevisionHistoryDrawer). Without it,
              LexicalComposer only reads `initialConfig.editorState` once on
              first mount and would keep showing stale content. */}
          <LexicalComposer key={documentKey} initialConfig={initialConfig}>
            <EditorErrorBoundary context="article-editor">
              <div className="inkling-editor relative flex min-h-0 w-full min-w-0 flex-1 flex-col">
                <div
                  ref={scrollContainerRef}
                  className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-3 pt-6 pb-editor-pad-bottom md:px-6"
                >
                  <div className="inkling-prose">
                    <ContentEditable
                      className="inkling-article-editor__content min-h-[12rem] focus:outline-none"
                      aria-placeholder="在此处开始编写内容…（/ 命令菜单，^ 空格插入脚注）"
                      placeholder={() => (
                        <div className="inkling-placeholder pointer-events-none absolute top-0 left-0 text-muted-foreground select-none">
                          在此处开始编写内容…（/ 命令菜单，^ 空格插入脚注）
                        </div>
                      )}
                    />
                  </div>
                </div>
                <EditorRefSetter editorRef={editorRefProp} />
                {/* `FootnoteAwareChangePlugin` merges the provider's footnote
                  definitions back into the serialized document so the
                  persisted shape carries `footnote-definition` blocks at the
                  root tail (matching what renderers + migrate-pt produce). */}
                <FootnoteAwareChangePlugin onChange={onDocumentChange} />
                <SharedHistoryPlugin />
                <AutoFocusPlugin />
                <InklingKeyboardNav />
                <FloatingFormatToolbar />
                {/* Hover-to-edit link toolbar: shows above a link on mousemove
                    (50ms debounce) with one-click edit / remove. */}
                <FloatingLinkToolbar />
                <InklingSlashMenuPlugin mode="article" />
                <InklingPlusMenuPlugin mode="article" />
                <FootnoteController />
                <InklingDragDropReorder />
                {/* Paste sanitiser: strips script/style/event-handlers/javascript:
                  URLs from pasted HTML before Lexical's default handler sees
                  it, then inserts the cleaned nodes. Without this, pasting
                  from Word/web produces uneditable (and sometimes XSS-laden)
                  content. */}
                <PastePlugin />
                {/* Document-normalisation transforms (mergeListNodes etc). */}
                <InklingDocumentTransforms />
                {/* Shell-level floating actions (publish FAB). Rendered in a
                  fixed slot at bottom-right so it overlays the scrollport
                  without participating in scroll sync. Gated on
                  `livePreviewOpen` to match the old PageBodyEditor behaviour:
                  the FAB only shows in single-pane edit mode, not when the
                  preview pane is open. */}
                {floatingActions && !livePreviewOpen ? (
                  <div className="pointer-events-auto fixed right-4 bottom-6 z-40 touch-manipulation sm:bottom-8 lg:right-6">
                    {floatingActions}
                  </div>
                ) : null}
              </div>
            </EditorErrorBoundary>
          </LexicalComposer>
        </InklingFootnoteProvider>
      </SharedHistoryProvider>
    </InklingArticleEditorProvider>
  )
}

function InklingKeyboardNav() {
  const [editor] = useLexicalComposerContext()
  useInklingKeyboardNavigation(editor)
  return null
}

function InklingDocumentTransforms() {
  const [editor] = useLexicalComposerContext()
  useEffect(() => registerInklingDocumentTransforms(editor), [editor])
  return null
}

function EditorRefSetter({ editorRef }: { editorRef?: RefObject<LexicalEditor | null> }) {
  const [editor] = useLexicalComposerContext()
  useEffect(() => {
    if (editorRef !== undefined) {
      editorRef.current = editor
    }
    return () => {
      if (editorRef !== undefined) {
        editorRef.current = null
      }
    }
  }, [editor, editorRef])
  return null
}

function SharedHistoryPlugin() {
  const historyState = useSharedHistoryState()
  return <HistoryPlugin externalHistoryState={historyState} />
}

/**
 * Bridge that feeds the footnote provider's `getDefinitions` into the change
 * plugin. Lives inside the composer (where the provider context is in scope)
 * so `OnInklingDocumentChangePlugin` itself stays decoupled from the footnote
 * subsystem and reusable by non-article editors.
 */
function FootnoteAwareChangePlugin({ onChange }: { onChange: (document: InklingDocument) => void }) {
  const { getDefinitions } = useInklingFootnotes()
  return <OnInklingDocumentChangePlugin onChange={onChange} getDefinitions={getDefinitions} />
}

export { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
