import type { InitialEditorStateType } from '@lexical/react/LexicalComposer'

import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { mergeRegister, BLUR_COMMAND, COMMAND_PRIORITY_LOW, FOCUS_COMMAND, type LexicalEditor } from 'lexical'
import React, { useContext } from 'react'

import InklingComposableEditor from '@/components/InklingComposableEditor'
import InklingNestedComposer from '@/components/InklingNestedComposer'
import CardContext from '@/context/CardContext'
import { useCardIsSelected } from '@/context/CardSelectionStoreContext'
import { MINIMAL_TRANSFORMERS } from '@/markdown/transformers-core'
import MINIMAL_NODES from '@/nodes/MinimalNodes'
import {
  registerCaptionArrowHandoff,
  registerCaptionTypeToFocus,
  registerNestedEnterHandoff,
} from '@/plugins/behaviour/nested-editor-protocol'
import { EmojiPickerPlugin } from '@/plugins/EmojiPickerPlugin'
import RestrictContentPlugin from '@/plugins/RestrictContentPlugin'

const Placeholder = ({ text = 'Type here' }) => {
  return (
    <div className="pointer-events-none absolute top-0 left-0 !m-0 min-w-full cursor-text font-sans text-sm leading-[24px] font-normal tracking-wide text-grey-500 dark:text-grey-800">
      {text}
    </div>
  )
}

function CaptionPlugin({ parentEditor }: { parentEditor: LexicalEditor }) {
  const [editor] = useLexicalComposerContext()
  const { setCaptionHasFocus, captionHasFocus, nodeKey } = useContext(CardContext)
  const isSelected = useCardIsSelected(nodeKey)

  // the type-to-focus policy lives in the nested-editor protocol; this
  // adapter only supplies the card's selection/focus reads
  React.useEffect(() => {
    return registerCaptionTypeToFocus(editor, {
      isSelected: () => isSelected,
      hasFocus: () => captionHasFocus,
    })
  }, [editor, isSelected, captionHasFocus])

  // handle focus/blur and enter key commands
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
      // the caption arrow hand-off lives in the nested-editor protocol
      // beside the Enter hand-off it mirrors
      registerCaptionArrowHandoff(editor, parentEditor),
    )
  }, [editor, setCaptionHasFocus, parentEditor, nodeKey])

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
  return (
    <InklingNestedComposer
      initialEditor={captionEditor}
      initialEditorState={captionEditorInitialState}
      // oxlint-disable-next-line typescript/no-deprecated -- load-bearing: the caption editor's node set arrives via this prop; see InklingNestedComposer
      initialNodes={MINIMAL_NODES}
    >
      <InklingComposableEditor
        className={className}
        markdownTransformers={MINIMAL_TRANSFORMERS}
        placeholder={<Placeholder text={placeholderText} />}
      >
        <CaptionPlugin parentEditor={parentEditor} />
        <RestrictContentPlugin paragraphs={paragraphs} />
        <EmojiPickerPlugin />
      </InklingComposableEditor>
    </InklingNestedComposer>
  )
}

export default InklingCaptionEditor
