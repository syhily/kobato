import type { LexicalEditor, SerializedRootNode } from 'lexical'
import type { RefObject } from 'react'

import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { useEffect, useMemo } from 'react'

import type { InklingBlockNode, InklingDocument } from '@/shared/inkling/schema'
import type { InklingArticleEditorProps, InklingFlushHandle } from '@/ui/inkling/editor/article/article-editor-types'
import type { FootnoteDefinitionItem } from '@/ui/inkling/editor/footnotes/InklingFootnoteProvider'

import InklingComposableEditor from '@/ui/inkling-editor/components/InklingComposableEditor'
import InklingComposer from '@/ui/inkling-editor/components/InklingComposer'
import { SharedHistoryContext } from '@/ui/inkling-editor/context/SharedHistoryContext'
import PlusCardMenuPlugin from '@/ui/inkling-editor/plugins/PlusCardMenuPlugin'
import SlashCardMenuPlugin from '@/ui/inkling-editor/plugins/SlashCardMenuPlugin'
import { InklingArticleEditorProvider } from '@/ui/inkling/editor/article/article-editor-context'
import { INKLING_MARKDOWN_TRANSFORMERS } from '@/ui/inkling/editor/behaviour/markdown-shortcuts'
import { attachVendoredCardMenus } from '@/ui/inkling/editor/cards/card-registry'
import { reportEditorError } from '@/ui/inkling/editor/error-report'
import { FootnoteController } from '@/ui/inkling/editor/footnotes/FootnoteController'
import { InklingFootnoteProvider, useInklingFootnotes } from '@/ui/inkling/editor/footnotes/InklingFootnoteProvider'
import { ARTICLE_NODES } from '@/ui/inkling/editor/nodes/registry'
import { CardInsertPlugin } from '@/ui/inkling/editor/plugins/CardInsertPlugin'
import { OnInklingDocumentChangePlugin } from '@/ui/inkling/editor/plugins/OnInklingDocumentChangePlugin'
import { toSerializedRoot } from '@/ui/inkling/editor/shared/lexical-bridge'

// Register our card set with the vendored slash/plus menus. Idempotent
// static assignment — must run before the first menu build, hence module
// scope rather than a component effect.
attachVendoredCardMenus()

/** Lexical theme classes styled by src/styles/inkling/core.css + the
 *  post-content prose system (NOT the vendored default theme, whose class
 *  names have no stylesheet here). */
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
  scrollContainerRef,
  flushHandleRef,
  floatingActions,
}: InklingArticleEditorProps) {
  // Strip footnote definitions once per `initialDocument` identity. The prose
  // root seeds the editor; the definitions seed the provider. Both derive
  // from the same memo so they never disagree.
  const { proseRoot, definitions: initialFootnoteDefinitions } = useMemo(
    () => stripFootnoteDefinitions(initialDocument),
    [initialDocument],
  )

  // The vendored composer accepts the serialized state as a plain object and
  // JSON-stringifies it internally.
  const initialEditorState = useMemo(() => ({ root: proseRoot }) as Record<string, unknown>, [proseRoot])

  const darkMode = typeof document !== 'undefined' && document.documentElement.classList.contains('dark')

  return (
    <InklingArticleEditorProvider actions={actions}>
      {/* `key={documentKey}` remounts the provider alongside the composer so
          its parallel footnote-definition state resets when the body source
          changes. Without this the provider would carry the previous
          document's definitions into the new edit session. */}
      <InklingFootnoteProvider key={documentKey} initialDefinitions={initialFootnoteDefinitions}>
        {/* `key={documentKey}` forces the composer to remount when the body
            source identity changes (e.g. adopting a server revision from
            DraftConflictDialog or RevisionHistoryDrawer). The composer only
            reads `initialEditorState` once on first mount and would keep
            showing stale content otherwise. */}
        <InklingComposer
          key={documentKey}
          nodes={ARTICLE_NODES}
          initialEditorState={initialEditorState}
          theme={theme}
          darkMode={darkMode}
          isTKEnabled={false}
          onError={(error: Error) => {
            reportEditorError(error, 'article')
          }}
        >
          <SharedHistoryContext>
            <div className="inkling-editor relative flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden rounded-xl border bg-card">
              <div
                ref={scrollContainerRef}
                className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-3 pt-6 pb-editor-pad-bottom md:px-6"
              >
                <div className="inkling-prose post-content mx-auto w-full max-w-2xl">
                  <InklingComposableEditor
                    readOnly={disabled === true}
                    inheritStyles
                    isSnippetsEnabled={false}
                    markdownTransformers={INKLING_MARKDOWN_TRANSFORMERS}
                    placeholderText="在此处开始编写内容…（/ 命令菜单，^ 空格插入脚注）"
                  >
                    <SlashCardMenuPlugin />
                    <PlusCardMenuPlugin />
                    <CardInsertPlugin />
                    <FootnoteAwareChangePlugin onChange={onDocumentChange} flushHandleRef={flushHandleRef} />
                    <FootnoteController />
                    <EditorRefSetter editorRef={editorRefProp} />
                    <EditableStateSync disabled={disabled} />
                  </InklingComposableEditor>
                </div>
              </div>
              {/* Shell-level floating actions (publish FAB). Rendered in a
                  fixed slot at bottom-right so it overlays the scrollport
                  without participating in scroll sync. */}
              {floatingActions ? (
                <div className="pointer-events-auto fixed right-4 bottom-6 z-40 touch-manipulation sm:bottom-8 lg:right-6">
                  {floatingActions}
                </div>
              ) : null}
            </div>
          </SharedHistoryContext>
        </InklingComposer>
      </InklingFootnoteProvider>
    </InklingArticleEditorProvider>
  )
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

/** The vendored composer never sets Lexical's `editable` flag; sync it from
 *  the shell's `disabled` prop (covers both initial value and mid-session
 *  toggles while a save mutation is pending). */
function EditableStateSync({ disabled }: { disabled?: boolean }) {
  const [editor] = useLexicalComposerContext()
  useEffect(() => {
    editor.setEditable(disabled !== true)
  }, [editor, disabled])
  return null
}

/**
 * Bridge that feeds the footnote provider's `getDefinitions` into the change
 * plugin. Lives inside the composer (where the provider context is in scope)
 * so `OnInklingDocumentChangePlugin` itself stays decoupled from the footnote
 * subsystem and reusable by non-article editors.
 */
function FootnoteAwareChangePlugin({
  onChange,
  flushHandleRef,
}: {
  onChange: (document: InklingDocument) => void
  flushHandleRef?: RefObject<InklingFlushHandle | null>
}) {
  const { getDefinitions } = useInklingFootnotes()
  return (
    <OnInklingDocumentChangePlugin
      onChange={onChange}
      getDefinitions={getDefinitions}
      flushHandleRef={flushHandleRef}
    />
  )
}
