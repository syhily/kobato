import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { mergeRegister } from '@lexical/utils'
import {
  BLUR_COMMAND,
  COMMAND_PRIORITY_HIGH,
  COMMAND_PRIORITY_LOW,
  FOCUS_COMMAND,
  KEY_ARROW_DOWN_COMMAND,
  KEY_ARROW_UP_COMMAND,
  KEY_ENTER_COMMAND,
} from 'lexical'
import React, { useCallback, useContext } from 'react'

import type { NestedKeyboardEvent } from '@/ui/inkling-editor/types/events'
import type { InklingEditorInternals } from '@/ui/inkling-editor/types/lexical-internals'

import InklingComposableEditor from '@/ui/inkling-editor/components/InklingComposableEditor'
import InklingNestedComposer from '@/ui/inkling-editor/components/InklingNestedComposer'
import CardContext from '@/ui/inkling-editor/context/CardContext'
import MINIMAL_NODES from '@/ui/inkling-editor/nodes/MinimalNodes'
import { EmojiPickerPlugin } from '@/ui/inkling-editor/plugins/EmojiPickerPlugin'
import { MINIMAL_TRANSFORMERS } from '@/ui/inkling-editor/plugins/MarkdownShortcutPlugin'
import RestrictContentPlugin from '@/ui/inkling-editor/plugins/RestrictContentPlugin'

const Placeholder = ({ text = 'Type here' }) => {
  return (
    <div className="pointer-events-none absolute top-0 left-0 !m-0 min-w-full cursor-text font-sans text-sm leading-[24px] font-normal tracking-wide text-grey-500 dark:text-grey-800">
      {text}
    </div>
  )
}

function CaptionPlugin({ parentEditor }: { parentEditor: import('lexical').LexicalEditor }) {
  const [editor] = useLexicalComposerContext()
  const { setCaptionHasFocus, captionHasFocus, nodeKey, isSelected } = useContext(CardContext)

  // focus on caption editor when something is typed while card is selected
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      // don't focus caption input if card is not selected
      if (!isSelected) {
        return
      }

      // don't focus caption input if any other input or textarea is focused
      if ((event.target as Element).matches('input, textarea')) {
        return
      }

      // only if key is printable key, focus on editor
      if (!captionHasFocus && event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
        editor.focus()
      }
    },
    [editor, captionHasFocus, isSelected],
  )

  React.useEffect(() => {
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [handleKeyDown, editor])

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
      editor.registerCommand(
        KEY_ENTER_COMMAND,
        (event) => {
          // TODO: find a more elegant way to handle this
          // intercept enter commands when interacting with the typeahead menu (same command priority)
          if (document.querySelector(`#typeahead-menu`)) {
            return false
          }

          // allow shift+enter to create a line break
          if (event?.shiftKey) {
            return false
          }

          // otherwise, let the parent editor handle the enter key
          // - with ctrl/cmd+enter toggles edit mode
          // - or creates paragraph after card and moves cursor
          ;(event as NestedKeyboardEvent)._fromNested = true
          ;(editor as InklingEditorInternals)._parentEditor!.dispatchCommand(KEY_ENTER_COMMAND, event)

          // prevent normal/InklingBehaviourPlugin enter key behaviour
          return true
        },
        COMMAND_PRIORITY_LOW,
      ),
      editor.registerCommand(
        KEY_ARROW_DOWN_COMMAND,
        (event) => {
          // TODO: wait for new lexical version, see https://github.com/facebook/lexical/commit/df2a50bc88e0778af26e109502cfcfb9cbe245d5
          if (document.querySelector(`#typeahead-menu`)) {
            return false
          }
          // handle moving focus at the parent editor level (select next card)
          ;(event as NestedKeyboardEvent)._fromCaptionEditor = true
          ;(editor as InklingEditorInternals)._parentEditor!.dispatchCommand(KEY_ARROW_DOWN_COMMAND, event)
          return true
        },
        COMMAND_PRIORITY_HIGH,
      ),
      editor.registerCommand(
        KEY_ARROW_UP_COMMAND,
        (event) => {
          // TODO: wait for new lexical version, see https://github.com/facebook/lexical/commit/df2a50bc88e0778af26e109502cfcfb9cbe245d5
          if (document.querySelector(`#typeahead-menu`)) {
            return false
          }
          // handle moving focus at the parent editor level (select next card)
          ;(event as NestedKeyboardEvent)._fromCaptionEditor = true
          ;(editor as InklingEditorInternals)._parentEditor!.dispatchCommand(KEY_ARROW_UP_COMMAND, event)
          return true
        },
        COMMAND_PRIORITY_HIGH,
      ),
    )
  }, [editor, setCaptionHasFocus, parentEditor, nodeKey])

  return null
}

interface InklingCaptionEditorProps {
  paragraphs?: number
  captionEditor: import('lexical').LexicalEditor
  captionEditorInitialState?: unknown
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
