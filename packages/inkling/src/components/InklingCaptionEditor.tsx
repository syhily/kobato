import InklingComposableEditor from '@kobato/inkling-internal/components/InklingComposableEditor'
import InklingNestedComposer from '@kobato/inkling-internal/components/InklingNestedComposer'
import CardContext from '@kobato/inkling-internal/context/CardContext'
import { useCardIsSelected } from '@kobato/inkling-internal/context/CardSelectionStoreContext'
import InklingUiPrefsContext from '@kobato/inkling-internal/context/InklingUiPrefsContext'
import { MINIMAL_TRANSFORMERS } from '@kobato/inkling-internal/markdown/transformers-core'
import MINIMAL_NODES from '@kobato/inkling-internal/nodes/MinimalNodes'
import {
  registerCaptionArrowHandoff,
  registerCaptionTypeToFocus,
  registerNestedEnterHandoff,
} from '@kobato/inkling-internal/plugins/behaviour/nested-editor-protocol'
import { EmojiPickerPlugin } from '@kobato/inkling-internal/plugins/EmojiPickerPlugin'
import RestrictContentPlugin from '@kobato/inkling-internal/plugins/RestrictContentPlugin'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import {
  mergeRegister,
  BLUR_COMMAND,
  COMMAND_PRIORITY_LOW,
  FOCUS_COMMAND,
  type InitialEditorStateType,
  type LexicalEditor,
} from 'lexical'
import React, { useContext } from 'react'

const Placeholder = ({ text = 'Type here' }) => {
  return (
    <div className="text-grey-500 dark:text-grey-800 pointer-events-none absolute top-0 left-0 !m-0 min-w-full cursor-text font-sans text-sm leading-[2.4rem] font-normal tracking-wide">
      {text}
    </div>
  )
}

function CaptionPlugin({ parentEditor }: { parentEditor: LexicalEditor }) {
  const [editor] = useLexicalComposerContext()
  const { setCaptionHasFocus, captionHasFocus, nodeKey } = useContext(CardContext)
  const isSelected = useCardIsSelected(nodeKey)

  React.useEffect(() => {
    return registerCaptionTypeToFocus(editor, {
      isSelected: () => isSelected,
      hasFocus: () => captionHasFocus,
    })
  }, [editor, isSelected, captionHasFocus])

  React.useEffect(() => {
    return mergeRegister(
      editor.registerCommand(
        FOCUS_COMMAND,
        () => {
          setCaptionHasFocus(true)
          return false
        },
        COMMAND_PRIORITY_LOW,
      ),
      editor.registerCommand(
        BLUR_COMMAND,
        () => {
          setCaptionHasFocus(false)
          return false
        },
        COMMAND_PRIORITY_LOW,
      ),
      registerNestedEnterHandoff(editor, parentEditor),

      registerCaptionArrowHandoff(editor, parentEditor),
    )
  }, [editor, setCaptionHasFocus, parentEditor])

  return null
}

interface InklingCaptionEditorProps {
  paragraphs?: number
  captionEditor: LexicalEditor
  captionEditorInitialState?: InitialEditorStateType
  placeholderText?: string
  className?: string
}

const InklingCaptionEditor = ({
  paragraphs = 1,
  captionEditor,
  captionEditorInitialState,
  placeholderText,
  className = 'inkling-lexical-caption',
}: InklingCaptionEditorProps) => {
  const [parentEditor] = useLexicalComposerContext()

  const { isEmojiEnabled } = useContext(InklingUiPrefsContext)
  return (
    <InklingNestedComposer
      initialEditor={captionEditor}
      initialEditorState={captionEditorInitialState}
      // oxlint-disable-next-line typescript/no-deprecated
      initialNodes={MINIMAL_NODES}
    >
      <InklingComposableEditor
        className={className}
        markdownTransformers={MINIMAL_TRANSFORMERS}
        placeholder={<Placeholder text={placeholderText} />}
      >
        <CaptionPlugin parentEditor={parentEditor} />
        <RestrictContentPlugin paragraphs={paragraphs} />
        {isEmojiEnabled !== false && <EmojiPickerPlugin />}
      </InklingComposableEditor>
    </InklingNestedComposer>
  )
}

export default InklingCaptionEditor
