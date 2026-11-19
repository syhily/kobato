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

  // state, not a ref: the component re-renders when the editor's editable
  // state changes and must re-focus then
  const [shouldFocus, setShouldFocus] = React.useState(autoFocus)

  // Sync the nested editor's editable state with the parent card's editing
  // state synchronously (before browser paint). Without this, the nested
  // editor can briefly be contenteditable="true" during decorator mount
  // (e.g. after undo restores a card), causing the browser to fire
  // selectionchange events that interfere with the parent editor's selection.
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
      // watch for editor becoming editable rather than relying on an `isEditing` prop
      // because the prop will change before the contenteditable becomes editable, meaning
      // the focus attempt hits a non-editable editor and focus lands on the main editor
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
      // The shared Enter choreography (shift/null pass-through, mark +
      // re-dispatch + swallow) lives in the nested-editor protocol. It must
      // be registered AFTER the listener above: Lexical fires same-priority
      // listeners in registration order, so the plugin-specific branches get
      // first refusal and the hand-off only sees what they decline.
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
