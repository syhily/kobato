import CardContext from '@kobato/inkling-internal/context/CardContext'
import { useCardIsEditing } from '@kobato/inkling-internal/context/CardSelectionStoreContext'
import { focusEditorRoot } from '@kobato/inkling-internal/plugins/behaviour/card-adjacency'
import {
  isTypeaheadMenuOpen,
  markEventFromNested,
  registerNestedBlurCardReselect,
  registerNestedEnterHandoff,
} from '@kobato/inkling-internal/plugins/behaviour/nested-editor-protocol'
import { getParentEditor } from '@kobato/inkling-internal/utils/lexical-internals'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { mergeRegister, COMMAND_PRIORITY_LOW, KEY_ENTER_COMMAND } from 'lexical'
import React from 'react'

export type FocusNextTarget = { focus: (fn: () => void) => void; getRootElement: () => HTMLElement | null }

function InklingNestedEditorPlugin({
  autoFocus,
  focusNext,
  hasSettingsPanel,

  defaultInklingEnterBehaviour = false,
}: {
  autoFocus?: boolean
  focusNext?: FocusNextTarget | null
  hasSettingsPanel?: boolean
  defaultInklingEnterBehaviour?: boolean
}) {
  const [editor] = useLexicalComposerContext()
  const { nodeKey: parentCardNodeKey } = React.useContext(CardContext)
  const isParentCardEditing = useCardIsEditing(parentCardNodeKey)

  const [shouldFocus, setShouldFocus] = React.useState(autoFocus)

  React.useLayoutEffect(() => {
    if (parentCardNodeKey !== undefined) {
      editor.setEditable(isParentCardEditing)
    }
  }, [editor, isParentCardEditing, parentCardNodeKey])

  React.useEffect(() => {
    if (!isParentCardEditing) {
      return
    }

    if (shouldFocus) {
      editor.focus(() => {
        focusEditorRoot(editor)
      })
    }
  }, [shouldFocus, editor, isParentCardEditing])

  React.useEffect(() => {
    return mergeRegister(
      editor.registerEditableListener((isEditable) => {
        if (!autoFocus) {
          return
        }

        if (isEditable) {
          setShouldFocus(true)
        } else {
          setShouldFocus(false)
        }
      }),
      editor.registerCommand(
        KEY_ENTER_COMMAND,
        (event) => {
          const parentEditor = getParentEditor(editor)

          if (isTypeaheadMenuOpen()) {
            return false
          }

          if (event && (event.metaKey || event.ctrlKey)) {
            if (!parentEditor) {
              return true
            }
            parentEditor.dispatchCommand(KEY_ENTER_COMMAND, markEventFromNested(event))
            return true
          }

          if (focusNext && !event?.shiftKey) {
            event?.preventDefault()
            focusNext.focus(() => {
              focusNext.getRootElement()?.focus({ preventScroll: true })
            })
            return true
          }

          return false
        },
        COMMAND_PRIORITY_LOW,
      ),
      ...(defaultInklingEnterBehaviour ? [registerNestedEnterHandoff(editor, () => getParentEditor(editor))] : []),

      registerNestedBlurCardReselect(editor, {
        parentCardNodeKey,
        hasSettingsPanel: !!hasSettingsPanel,
        parentEditor: () => getParentEditor(editor),
      }),
    )
  }, [editor, autoFocus, focusNext, parentCardNodeKey, hasSettingsPanel, defaultInklingEnterBehaviour])

  return null
}

export default InklingNestedEditorPlugin
