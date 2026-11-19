import type { CorePluginScope } from '@kobato/inkling-internal/plugins/CorePlugins'
import type { ExternalControlAPI } from '@kobato/inkling-internal/plugins/ExternalControlPlugin'
import type { Transformer } from '@lexical/markdown'
import type { EditorState, SerializedEditorState } from 'lexical'

import { EditorPlaceholder } from '@kobato/inkling-internal/components/ui/EditorPlaceholder'
import { useDragDropHandle } from '@kobato/inkling-internal/context/DragDropHandleContext'
import InklingUiPrefsContext from '@kobato/inkling-internal/context/InklingUiPrefsContext'
import { useSharedEditorStateContext } from '@kobato/inkling-internal/context/SharedEditorStateContext'
import { type HiddenFormat } from '@kobato/inkling-internal/plugins/behaviour/format-toolbar'
import CorePlugins from '@kobato/inkling-internal/plugins/CorePlugins'
import { getParentEditor } from '@kobato/inkling-internal/utils/lexical-internals'
import { useCollaborationContext } from '@lexical/react/LexicalCollaborationContext'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import React from 'react'

export interface InklingComposableEditorProps {
  onChange?: (editorState: SerializedEditorState) => void
  onBlur?: () => void
  onFocus?: () => void
  markdownTransformers?: readonly Transformer[]
  registerAPI?: (api: ExternalControlAPI | null) => void
  cursorDidExitAtTop?: () => void
  children?: React.ReactNode
  // ReactElement, not ReactNode: upstream RichTextPlugin's placeholder
  // contract is Element | ((isEditable) => Element | null) — widening the
  // prop past it would fail at that boundary instead of here
  placeholder?: React.ReactElement
  singleParagraph?: boolean
  placeholderText?: string
  placeholderClassName?: string
  className?: string
  contentEditableClassName?: string
  readOnly?: boolean
  isDragEnabled?: boolean
  inheritStyles?: boolean
  isSnippetsEnabled?: boolean
  hiddenFormats?: HiddenFormat[]
  useDefaultClasses?: boolean
  dataTestId?: string
  alignment?: boolean
  focusMode?: boolean
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
  contentEditableClassName,
  readOnly = false,
  isDragEnabled = true,
  inheritStyles = false,
  isSnippetsEnabled = true,
  hiddenFormats = [],
  useDefaultClasses = true,
  dataTestId,
  alignment,
  focusMode,
}: InklingComposableEditorProps) => {
  const { historyState, onChange: sharedOnChange } = useSharedEditorStateContext()
  const [editor] = useLexicalComposerContext()
  const { isCollabActive } = useCollaborationContext()
  const { darkMode, isTKEnabled } = React.useContext(InklingUiPrefsContext)
  const dragDropHandle = useDragDropHandle()

  const parentEditor = getParentEditor(editor)
  const isNested = parentEditor !== null
  const isDragReorderEnabled = isDragEnabled && !readOnly && !isNested

  const _onChange = React.useCallback(
    (editorState: EditorState) => {
      if (sharedOnChange) {
        // sharedOnChange fires for nested editors too: serialize the top-level
        // (parent) editor's state so the payload is never just a nested editor
        const primaryEditorState = (parentEditor || editor).getEditorState()
        const json = primaryEditorState.toJSON()
        sharedOnChange(json)
      }

      if (onChange) {
        const json = editorState.toJSON()
        onChange(json)
      }
    },
    [onChange, sharedOnChange, editor, parentEditor],
  )

  const editorContainerRef = React.useRef<HTMLElement | null>(null)
  const onWrapperRef = React.useCallback(
    (wrapperElem: HTMLElement | null) => {
      if (!isNested) {
        editorContainerRef.current = wrapperElem
        dragDropHandle.setState({ containerElement: wrapperElem })
      }
    },
    [isNested, dragDropHandle],
  )

  const [floatingAnchorElem, setFloatingAnchorElem] = React.useState<HTMLDivElement | null>(null)
  const onContentEditableRef = (_floatingAnchorElem: HTMLDivElement | null) => {
    // the null branch matters: without it a stale anchor survives between
    // unmount and remount
    setFloatingAnchorElem(_floatingAnchorElem)
  }

  const corePluginScope: CorePluginScope = {
    contentEditableRef: onContentEditableRef,
    contentEditableClassName: useDefaultClasses
      ? ['inkling-prose', contentEditableClassName].filter(Boolean).join(' ')
      : (contentEditableClassName ?? ''),
    readOnly,
    placeholder: placeholder || <EditorPlaceholder className={placeholderClassName} text={placeholderText} />,
    onEditorChange: _onChange,
    historyState,
    isCollabActive,
    containerElem: editorContainerRef,
    cursorDidExitAtTop,
    isNested,
    alignment,
    focusMode,
    markdownTransformers,
    floatingAnchorElem,
    hiddenFormats,
    isSnippetsEnabled,
    registerAPI,
    isDragReorderEnabled,
    singleParagraph,
    onBlur,
    onFocus,
    isTKEnabled,
  }

  return (
    <div
      ref={onWrapperRef}
      className={`${useDefaultClasses ? 'inkling-lexical' : ''} ${inheritStyles ? 'inkling-inherit-styles' : ''} ${darkMode ? 'dark' : ''} ${className}`}
      data-inkling-dnd-disabled={!isDragEnabled}
      data-testid={dataTestId}
    >
      <CorePlugins scope={corePluginScope} />
      {children}
    </div>
  )
}

export default InklingComposableEditor
