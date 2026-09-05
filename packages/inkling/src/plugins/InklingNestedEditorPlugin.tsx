import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { mergeRegister, COMMAND_PRIORITY_LOW, KEY_ENTER_COMMAND } from 'lexical'
import React from 'react'

import CardContext from '@/context/CardContext'
import { useCardIsEditing } from '@/context/CardSelectionStoreContext'
import { focusEditorRoot } from '@/plugins/behaviour/card-adjacency'
import {
  isTypeaheadMenuOpen,
  markEventFromNested,
  registerNestedBlurCardReselect,
  registerNestedEnterHandoff,
} from '@/plugins/behaviour/nested-editor-protocol'
import { getParentEditor } from '@/utils/lexical-internals'

// the nested editor the Enter key hands focus to (Header subheader, Toggle
// content) — structurally the part of LexicalEditor the hand-off needs
export type FocusNextTarget = { focus: (fn: () => void) => void; getRootElement: () => HTMLElement | null }

function InklingNestedEditorPlugin({
  autoFocus,
  focusNext,
  hasSettingsPanel,
  // Enter will focus the next card if this is true
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

  // using state here because this component can get re-rendered after the
  // editor's editable state changes so we need to re-focus on re-render
  const [shouldFocus, setShouldFocus] = React.useState(autoFocus)

  // Sync the nested editor's editable state with the parent card's editing
  // state synchronously (before browser paint). Without this, the nested
  // editor can briefly be contenteditable="true" during decorator mount
  // (e.g. after undo restores a card), causing the browser to fire
  // selectionchange events that interfere with the parent editor's selection.
  React.useLayoutEffect(() => {
    if (parentCardNodeKey !== undefined) {
      editor.setEditable(!!isParentCardEditing)
    }
  }, [editor, isParentCardEditing, parentCardNodeKey])

  React.useEffect(() => {
    // prevent nested editor getting focus when its card isn't being edited
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
      // we try to focus a non-editable editor which puts focus on the main editor instead
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

          // don't swallow events meant for an open typeahead menu — the
          // protocol module explains why this can't be priority-based yet
          if (isTypeaheadMenuOpen()) {
            return false
          }

          // let the parent editor handle the edit mode product
          if (event && (event.metaKey || event.ctrlKey)) {
            if (!parentEditor) {
              return true
            }
            parentEditor.dispatchCommand(KEY_ENTER_COMMAND, markEventFromNested(event))
            return true
          }

          // move focus to the next editor if it exists (e.g. from header to content editor)
          if (focusNext && !event?.shiftKey) {
            event?.preventDefault()
            focusNext.focus(() => {
              focusNext.getRootElement()?.focus({ preventScroll: true })
            })
            return true
          }

          // anything the plugin-specific branches above didn't claim falls
          // through to the shared Enter hand-off below (registered only when
          // defaultInklingEnterBehaviour is on)
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
      // the blur → card-reselect choreography lives in the nested-editor
      // protocol beside the Enter hand-off
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
