import '@/ui/inkling-editor/styles/index.css'
import { useCollaborationContext } from '@lexical/react/LexicalCollaborationContext'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { ContentEditable } from '@lexical/react/LexicalContentEditable'
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin'
import { LinkPlugin } from '@lexical/react/LexicalLinkPlugin'
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin'
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin'
import React from 'react'

import InklingErrorBoundary from '@/ui/inkling-editor/components/InklingErrorBoundary'
import { EditorPlaceholder } from '@/ui/inkling-editor/components/ui/EditorPlaceholder'
import InklingComposerContext from '@/ui/inkling-editor/context/InklingComposerContext'
import { useSharedHistoryContext } from '@/ui/inkling-editor/context/SharedHistoryContext'
import { useSharedOnChangeContext } from '@/ui/inkling-editor/context/SharedOnChangeContext'
import { RestrictContentPlugin } from '@/ui/inkling-editor/index'
import DragDropPastePlugin from '@/ui/inkling-editor/plugins/DragDropPastePlugin'
import DragDropReorderPlugin from '@/ui/inkling-editor/plugins/DragDropReorderPlugin'
import { ExternalControlPlugin } from '@/ui/inkling-editor/plugins/ExternalControlPlugin'
import FloatingToolbarPlugin from '@/ui/inkling-editor/plugins/FloatingToolbarPlugin'
import InklingBehaviourPlugin from '@/ui/inkling-editor/plugins/InklingBehaviourPlugin'
import { InklingBlurPlugin } from '@/ui/inkling-editor/plugins/InklingBlurPlugin'
import { InklingFocusPlugin } from '@/ui/inkling-editor/plugins/InklingFocusPlugin'
import MarkdownPastePlugin from '@/ui/inkling-editor/plugins/MarkdownPastePlugin'
import MarkdownShortcutPlugin from '@/ui/inkling-editor/plugins/MarkdownShortcutPlugin'
import TKPlugin from '@/ui/inkling-editor/plugins/TKPlugin'

interface InklingComposableEditorProps {
  onChange?: (editorState: unknown) => void
  onBlur?: () => void
  onFocus?: () => void
  markdownTransformers?: unknown[]
  registerAPI?: (api: object | null) => void
  cursorDidExitAtTop?: () => void
  children?: React.ReactNode
  placeholder?: React.ReactNode
  singleParagraph?: boolean
  placeholderText?: string
  placeholderClassName?: string
  className?: string
  readOnly?: boolean
  isDragEnabled?: boolean
  inheritStyles?: boolean
  isSnippetsEnabled?: boolean
  hiddenFormats?: string[]
  useDefaultClasses?: boolean
  dataTestId?: string
}

const InklingComposableEditor = ({
  onChange,
  onBlur,
  onFocus,
  markdownTransformers,
  registerAPI,
  cursorDidExitAtTop,
  children,
  placeholder,
  singleParagraph,
  placeholderText,
  placeholderClassName = '',
  className = '',
  readOnly = false,
  isDragEnabled = true,
  inheritStyles = false,
  isSnippetsEnabled = true,
  hiddenFormats = [],
  useDefaultClasses = true,
  dataTestId,
}: InklingComposableEditorProps) => {
  const { historyState } = useSharedHistoryContext()
  const [editor] = useLexicalComposerContext()
  const { isCollabActive } = useCollaborationContext()
  const { editorContainerRef, darkMode, isTKEnabled } = React.useContext(InklingComposerContext)

  const isNested = !!editor._parentEditor
  const isDragReorderEnabled = isDragEnabled && !readOnly && !isNested

  const { onChange: sharedOnChange } = useSharedOnChangeContext()
  const _onChange = React.useCallback(
    (editorState: { toJSON: () => unknown }) => {
      if (sharedOnChange) {
        // sharedOnChange is called for the main editor and nested editors, we want to
        // make sure we don't accidentally serialize only the contents of the nested
        // editor so we need to use the parent editor when it exists
        const primaryEditorState = (editor._parentEditor || editor).getEditorState()
        const json = primaryEditorState.toJSON()
        sharedOnChange(json)
      }

      if (onChange) {
        // onChange is only called for this current editor instance, allowing for
        // per-editor onChange handlers
        const json = editorState.toJSON()
        onChange(json)
      }
    },
    [onChange, sharedOnChange, editor],
  )

  const onWrapperRef = (wrapperElem: HTMLElement | null) => {
    if (!isNested) {
      ;(editorContainerRef as React.MutableRefObject<HTMLElement | null>).current = wrapperElem
    }
  }

  // we need an element reference for the container element that
  // any floating elements in plugins will be rendered inside
  const [floatingAnchorElem, setFloatingAnchorElem] = React.useState<HTMLDivElement | null>(null)
  const onContentEditableRef = (_floatingAnchorElem: HTMLDivElement | null) => {
    if (_floatingAnchorElem !== null) {
      setFloatingAnchorElem(_floatingAnchorElem)
    }
  }

  // oxlint-disable-next-line typescript/no-explicit-any
  const markdownTransformersAny = markdownTransformers as any
  return (
    <div
      ref={onWrapperRef}
      className={`${useDefaultClasses ? 'inkling-lexical' : ''} ${inheritStyles ? 'inkling-inherit-styles' : ''} ${darkMode ? 'dark' : ''} ${className}`}
      data-inkling-dnd-disabled={!isDragEnabled}
      data-testid={dataTestId}
    >
      <RichTextPlugin
        contentEditable={
          <div ref={onContentEditableRef} data-inkling="editor">
            <ContentEditable className={useDefaultClasses ? 'inkling-prose' : ''} readOnly={readOnly} />
          </div>
        }
        ErrorBoundary={InklingErrorBoundary}
        placeholder={
          (placeholder || (
            <EditorPlaceholder className={placeholderClassName} text={placeholderText} />
          )) as React.ReactElement
        }
      />
      <LinkPlugin />
      <OnChangePlugin ignoreHistoryMergeTagChange={false} ignoreSelectionChange={true} onChange={_onChange} />
      {!isCollabActive && <HistoryPlugin externalHistoryState={historyState} />}{' '}
      {/* adds undo/redo, in multiplayer that's handled by yjs */}
      <InklingBehaviourPlugin
        containerElem={editorContainerRef}
        cursorDidExitAtTop={cursorDidExitAtTop}
        isNested={isNested}
      />
      <MarkdownShortcutPlugin transformers={markdownTransformersAny as never[]} />
      {floatingAnchorElem && (
        <FloatingToolbarPlugin
          anchorElem={floatingAnchorElem}
          hiddenFormats={hiddenFormats as never[]}
          isSnippetsEnabled={isSnippetsEnabled}
        />
      )}
      <DragDropPastePlugin />
      {registerAPI ? <ExternalControlPlugin registerAPI={registerAPI} /> : null}
      {isDragReorderEnabled && <DragDropReorderPlugin />}
      {singleParagraph && <RestrictContentPlugin paragraphs={1} />}
      {onBlur && <InklingBlurPlugin onBlur={onBlur} />}
      {onFocus && <InklingFocusPlugin onFocus={onFocus} />}
      <MarkdownPastePlugin />
      {isTKEnabled && <TKPlugin />}
      {children}
    </div>
  )
}

export default InklingComposableEditor
