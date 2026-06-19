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

import type { InklingDocument } from '@/shared/inkling/schema'
import type { InklingArticleEditorProps } from '@/ui/inkling/editor/article/article-editor-types'

import { InklingArticleEditorProvider } from '@/ui/inkling/editor/article/article-editor-context'
import { InlineMathNode } from '@/ui/inkling/editor/article/InlineMathNode'
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
import { FootnoteController } from '@/ui/inkling/editor/footnotes/FootnoteController'
import { FootnoteDefinitionNode } from '@/ui/inkling/editor/footnotes/FootnoteDefinitionNode'
import { FootnoteRefNode } from '@/ui/inkling/editor/footnotes/FootnoteRefNode'
import { InklingFootnoteProvider } from '@/ui/inkling/editor/footnotes/InklingFootnoteProvider'
import { InklingSlashMenuPlugin } from '@/ui/inkling/editor/menu/SlashMenu'
import { SharedHistoryProvider, useSharedHistoryState } from '@/ui/inkling/editor/nested/SharedHistoryContext'
import { OnInklingDocumentChangePlugin } from '@/ui/inkling/editor/plugins/OnInklingDocumentChangePlugin'
import { FloatingFormatToolbar } from '@/ui/inkling/editor/toolbar/FloatingFormatToolbar'

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

const ARTICLE_NODES: InitialConfigType['nodes'] = [
  ParagraphNode,
  HeadingNode,
  QuoteNode,
  ListNode,
  ListItemNode,
  LinkNode,
  FootnoteRefNode,
  FootnoteDefinitionNode,
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

function inklingDocumentToSerializedRoot(document: InklingDocument): SerializedRootNode {
  return structuredClone(document.root) as unknown as SerializedRootNode
}

export function InklingArticleEditor({
  initialDocument,
  documentKey: _documentKey,
  onDocumentChange,
  disabled,
  actions = {},
  editorRef: editorRefProp,
}: InklingArticleEditorProps) {
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
        editor.setEditorState(
          editor.parseEditorState({
            root: inklingDocumentToSerializedRoot(initialDocument),
          }),
        )
      },
    }),
    [disabled, initialDocument],
  )

  return (
    <InklingArticleEditorProvider actions={actions}>
      <SharedHistoryProvider>
        <InklingFootnoteProvider>
          <LexicalComposer initialConfig={initialConfig}>
            <div className="inkling-editor">
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
              <EditorRefSetter editorRef={editorRefProp} />
              <OnInklingDocumentChangePlugin onChange={onDocumentChange} />
              <SharedHistoryPlugin />
              <AutoFocusPlugin />
              <InklingKeyboardNav />
              <FloatingFormatToolbar />
              <InklingSlashMenuPlugin mode="article" />
              <FootnoteController />
              <InklingDragDropReorder />
            </div>
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

export { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
