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
import { ParagraphNode, $createTextNode, $getSelection, $isRangeSelection } from 'lexical'
import { useMemo, useEffect, useState, useCallback } from 'react'

import type { InklingDocument } from '@/shared/inkling/schema'
import type { InklingArticleEditorProps } from '@/ui/inkling/editor/article/article-editor-types'

import { InklingArticleEditorProvider } from '@/ui/inkling/editor/article/article-editor-context'
import { InlineMathNode } from '@/ui/inkling/editor/article/InlineMathNode'
import { InklingDragDropReorder } from '@/ui/inkling/editor/behaviour/DragDropReorderPlugin'
import { useInklingKeyboardNavigation } from '@/ui/inkling/editor/behaviour/keyboard-navigation'
import {
  CodeCardNode,
  HorizontalRuleCardNode,
  ImageCardNode,
  MathCardNode,
  MusicCardNode,
  SolutionCardNode,
  TableCardNode,
  TwoColumnCardNode,
} from '@/ui/inkling/editor/cards/card-nodes'
import { registerFootnoteCaretTrigger } from '@/ui/inkling/editor/footnotes/FootnoteCaretTrigger'
import { FootnoteDialog } from '@/ui/inkling/editor/footnotes/FootnoteDialog'
import { FootnoteRefNode, $createFootnoteRefNode } from '@/ui/inkling/editor/footnotes/FootnoteRefNode'
import { InklingSlashMenuPlugin } from '@/ui/inkling/editor/menu/SlashMenu'
import { SharedHistoryProvider } from '@/ui/inkling/editor/nested/SharedHistoryContext'
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
}: InklingArticleEditorProps) {
  // P3.1 (floating toolbar) and P3.3 (slash menu) are TODO —
  // placeholder components that will be added in follow-up.
  const initialConfig: InitialConfigType = useMemo(
    () => ({
      namespace: 'inkling-article-editor',
      theme,
      onError: (error: Error) => {
        console.error('Inkling article editor error:', error)
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
            <OnInklingDocumentChangePlugin onChange={onDocumentChange} />
            <HistoryPlugin />
            <AutoFocusPlugin />
            <InklingKeyboardNav />
            <FloatingFormatToolbar />
            <InklingSlashMenuPlugin mode="article" />
            <FootnoteSystem />
            <InklingDragDropReorder />
            {/* P4.1 TODO: <InklingFootnoteProvider> / <FootnoteCaretTrigger /> / <FootnoteDialog /> */}
            {/* P4.2 TODO: <SharedHistoryContext> for nested editors */}
            {/* P4.3 TODO: <NestedEditor> wire for Solution/TwoColumn card decorate() */}
          </div>
        </LexicalComposer>
      </SharedHistoryProvider>
    </InklingArticleEditorProvider>
  )
}

function InklingKeyboardNav() {
  const [editor] = useLexicalComposerContext()
  useInklingKeyboardNavigation(editor)
  return null
}

function FootnoteSystem() {
  const [editor] = useLexicalComposerContext()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogText, setDialogText] = useState('')
  const [dialogIndex, setDialogIndex] = useState(0)

  useEffect(() => {
    if (editor === null) {
      return undefined
    }
    return registerFootnoteCaretTrigger(editor, () => {
      setDialogText('')
      setDialogIndex(1)
      setDialogOpen(true)
    })
  }, [editor])

  const handleSave = useCallback(
    (_text: string) => {
      editor?.update(() => {
        const selection = $getSelection()
        if (!$isRangeSelection(selection)) { return }
        const ref = $createFootnoteRefNode('fn', 'fn', 1)
        selection.insertNodes([ref, $createTextNode(' ')])
      })
      setDialogOpen(false)
    },
    [editor],
  )

  return (
    <FootnoteDialog
      open={dialogOpen}
      initialText={dialogText}
      index={dialogIndex}
      onSave={handleSave}
      onDelete={() => setDialogOpen(false)}
      onClose={() => setDialogOpen(false)}
    />
  )
}

export { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
