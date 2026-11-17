// Nested-editor protocol: the shared vocabulary and choreography nested editors
// (card sub-editors and caption editors) use to talk to their parent.
//
// Provenance rides on the re-dispatched KeyboardEvent itself — the same event
// crosses to the parent — so writers mark before dispatching and readers call
// getEventProvenance. Only this module knows the marker property names, so
// writers and readers cannot drift.
//
// Lexical fires same-priority listeners in registration order and the first
// `true` stops the chain, so specific branches register BEFORE the Enter
// hand-off. A `false` pass-through does not kill the event: it propagates up
// the parent-editor chain, so the parent's handlers still see it, unmarked.

import {
  $createNodeSelection,
  $getSelection,
  $setSelection,
  BLUR_COMMAND,
  COMMAND_PRIORITY_HIGH,
  COMMAND_PRIORITY_LOW,
  KEY_ARROW_DOWN_COMMAND,
  KEY_ARROW_UP_COMMAND,
  KEY_ENTER_COMMAND,
  mergeRegister,
  type LexicalCommand,
  type LexicalEditor,
  type NodeKey,
} from 'lexical'

export type NestedEditorProvenance = 'nested-editor' | 'caption-editor'

// Marker properties carrying provenance on a re-dispatched event; private to
// this module so external code goes through the mark/get functions and no
// reader casts.
interface ProvenanceMarkedKeyboardEvent extends KeyboardEvent {
  _fromNested?: boolean
  _fromCaptionEditor?: boolean
}

export function markEventFromNested(event: KeyboardEvent): KeyboardEvent {
  const marked = event as ProvenanceMarkedKeyboardEvent
  marked._fromNested = true
  return marked
}

export function markEventFromCaptionEditor(event: KeyboardEvent): KeyboardEvent {
  const marked = event as ProvenanceMarkedKeyboardEvent
  marked._fromCaptionEditor = true
  return marked
}

// Reads back a (possibly re-dispatched) event's provenance; null means never marked.
export function getEventProvenance(event: KeyboardEvent | null | undefined): NestedEditorProvenance | null {
  if (!event) {
    return null
  }
  const marked = event as ProvenanceMarkedKeyboardEvent
  if (marked._fromNested) {
    return 'nested-editor'
  }
  if (marked._fromCaptionEditor) {
    return 'caption-editor'
  }
  return null
}

// Set by Lexical's LexicalTypeaheadMenuPlugin itself — the id is Lexical's runtime contract, not this markup.
const TYPEAHEAD_MENU_ID = 'typeahead-menu'

export function isTypeaheadMenuOpen(): boolean {
  return typeof document !== 'undefined' && document.getElementById(TYPEAHEAD_MENU_ID) !== null
}

// Shared Enter choreography of both nested-editor surfaces: hand Enter to the
// parent editor. `parentEditor` is the editor itself or a per-event resolver;
// a missing parent is a pass-through.
export function registerNestedEnterHandoff(
  editor: LexicalEditor,
  parentEditor: LexicalEditor | (() => LexicalEditor | null),
): () => void {
  return editor.registerCommand(
    KEY_ENTER_COMMAND,
    (event) => {
      // an open menu handles Enter itself; priority cannot express this
      if (isTypeaheadMenuOpen()) {
        return false
      }

      if (event?.shiftKey) {
        return false
      }

      // the IME/mobile path dispatches a null event; leave it to Lexical's default Enter handling
      if (!event) {
        return false
      }

      const parent = typeof parentEditor === 'function' ? parentEditor() : parentEditor
      if (!parent) {
        return false
      }

      // the parent either toggles edit mode (ctrl/cmd+enter) or creates a
      // paragraph after the card and moves the caret there
      parent.dispatchCommand(KEY_ENTER_COMMAND, markEventFromNested(event))

      return true
    },
    COMMAND_PRIORITY_LOW,
  )
}

/**
 * Caption arrow hand-off: arrow keys in a caption editor re-dispatch to the
 * parent editor, marked with caption provenance so the parent's handlers can
 * reselect the card, with the same typeahead bail as the Enter hand-off.
 * Registered at COMMAND_PRIORITY_HIGH so the caption's arrows pre-empt the
 * shared LOW-priority handlers.
 */
export function registerCaptionArrowHandoff(editor: LexicalEditor, parentEditor: LexicalEditor): () => void {
  const registerArrowHandoff = (command: LexicalCommand<KeyboardEvent>) =>
    editor.registerCommand(
      command,
      (event) => {
        // arrows navigate the open typeahead menu instead of moving focus
        if (isTypeaheadMenuOpen()) {
          return false
        }
        parentEditor.dispatchCommand(command, markEventFromCaptionEditor(event))
        return true
      },
      COMMAND_PRIORITY_HIGH,
    )

  return mergeRegister(registerArrowHandoff(KEY_ARROW_UP_COMMAND), registerArrowHandoff(KEY_ARROW_DOWN_COMMAND))
}

/**
 * Blur half of the nested-editor boundary choreography: while a card's
 * settings panel is open, the parent editor clears its selection when the
 * nested editor takes focus — so on blur the parent card is reselected and the
 * panel keeps its anchor. Claims the blur only in that case; the reselect is
 * tagged history-merge so it never lands in undo history.
 */
export function registerNestedBlurCardReselect(
  editor: LexicalEditor,
  {
    parentCardNodeKey,
    hasSettingsPanel,
    parentEditor,
  }: {
    parentCardNodeKey: NodeKey | undefined
    hasSettingsPanel: boolean
    parentEditor: () => LexicalEditor | null
  },
): () => void {
  return editor.registerCommand(
    BLUR_COMMAND,
    () => {
      const parent = parentEditor()

      // restore the parent's card selection, cleared when the nested editor took focus
      if (hasSettingsPanel && parent) {
        parent.getEditorState().read(() => {
          parent.update(
            () => {
              if (!$getSelection()) {
                const selection = $createNodeSelection()
                if (parentCardNodeKey) {
                  selection.add(parentCardNodeKey)
                }
                $setSelection(selection)
              }
            },
            { tag: 'history-merge' },
          )
        })

        return true
      }

      return false
    },
    COMMAND_PRIORITY_LOW,
  )
}

/**
 * Caption type-to-focus policy: while the parent card is selected and the
 * caption is not focused, a printable keystroke — single character, no
 * ctrl/meta/alt, and not landing on an input or textarea — focuses the caption
 * editor. Document-level listener; returns the teardown. The ports are read per
 * event, so callers register once per state change cycle, not per keystroke.
 */
export function registerCaptionTypeToFocus(
  editor: LexicalEditor,
  { isSelected, hasFocus }: { isSelected: () => boolean; hasFocus: () => boolean },
): () => void {
  const handleKeyDown = (event: KeyboardEvent) => {
    if (!isSelected()) {
      return
    }

    const target = event.target
    if (target instanceof Element && target.matches('input, textarea')) {
      return
    }

    if (!hasFocus() && event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      editor.focus()
    }
  }

  document.addEventListener('keydown', handleKeyDown)
  return () => {
    document.removeEventListener('keydown', handleKeyDown)
  }
}
