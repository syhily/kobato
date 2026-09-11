// The nested-editor protocol — the shared vocabulary and choreography nested
// editors (card sub-editors and caption editors) use to talk to their parent
// editor, owned by this one headless module so it stops being an untyped
// convention scattered across five files.
//
// Two nouns and one verb:
//
// - Event provenance. Nested editors re-dispatch keyboard commands to the
//   parent editor (e.g. caption Enter → the parent's KEY_ENTER_COMMAND), and
//   the SAME KeyboardEvent object crosses the boundary, so provenance rides
//   on the event itself. Writers call `markEventFromNested` /
//   `markEventFromCaptionEditor` before dispatching; readers call
//   `getEventProvenance`. The mutation mechanism is this module's hidden
//   implementation — only this file knows the property names, so writers and
//   readers can no longer drift apart.
//   Writers: `InklingNestedEditorPlugin.tsx`, `InklingCaptionEditor.tsx`.
//   Readers: `keyboard-navigation/selection-extension.ts`, `keyboard-navigation/enter.ts`.
//
// - Typeahead presence. Lexical 0.46.0 added `commandPriority` to typeahead
//   menus, but the project's menus still register at the default
//   COMMAND_PRIORITY_LOW, so an open menu cannot pre-empt the nested editors'
//   own Enter/Arrow handlers by priority. Until menus register higher, those
//   handlers must bail out when a menu is open, and `isTypeaheadMenuOpen` is
//   the single place that names the menu's DOM id (stamped by Lexical's
//   LexicalTypeaheadMenuPlugin itself, so it is not ours to change).
//
// - Enter hand-off. Both nested-editor surfaces used to hand-roll the same
//   Enter choreography and drifted once already (only the caption guarded the
//   null event the IME/mobile path dispatches). `registerNestedEnterHandoff`
//   owns the shared core — typeahead bail, shift+enter pass, null-event pass,
//   mark + re-dispatch + swallow — so it cannot drift again; the plugin
//   gaining the null guard is the one deliberate behaviour change in the
//   consolidation. What stays with the callers, because it genuinely
//   diverges: `InklingNestedEditorPlugin` keeps its ctrl/cmd+enter edit-mode
//   routing and its focusNext focus hand-off in its own listener, registered
//   BEFORE the hand-off's — Lexical fires same-priority listeners in
//   registration order and the first `true` stops the chain, so the
//   plugin-specific branches get first refusal and the hand-off only sees
//   what they decline. The caption keeps its arrow-key re-dispatch with
//   caption provenance. Note that a pass-through (`false`) does not kill the
//   event: Lexical propagates unhandled commands up the parent-editor chain,
//   so the parent's own Enter handlers still see it, unmarked.

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

// The two marker properties that carry provenance on a re-dispatched event.
// Kept private to this module: external code must go through the mark/get
// functions above so no reader ever casts again.
interface ProvenanceMarkedKeyboardEvent extends KeyboardEvent {
  _fromNested?: boolean
  _fromCaptionEditor?: boolean
}

// Mark an event as re-dispatched from a card's nested editor (e.g. the Header
// subheader, or a caption's Enter key — see `InklingCaptionEditor.tsx`).
// Returns the same event for dispatch convenience.
export function markEventFromNested(event: KeyboardEvent): KeyboardEvent {
  const marked = event as ProvenanceMarkedKeyboardEvent
  marked._fromNested = true
  return marked
}

// Mark an event as re-dispatched from a card's caption editor (the caption
// arrow keys, which select the owning card in the parent editor).
export function markEventFromCaptionEditor(event: KeyboardEvent): KeyboardEvent {
  const marked = event as ProvenanceMarkedKeyboardEvent
  marked._fromCaptionEditor = true
  return marked
}

// Read back the provenance of a (possibly re-dispatched) event. `null` means
// the event originated in this editor and was never marked.
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

// Lexical's LexicalTypeaheadMenuPlugin stamps this id on its menu container
// (`containerDiv.setAttribute('id', 'typeahead-menu')`), so the selector is
// part of Lexical's runtime contract rather than our markup.
const TYPEAHEAD_MENU_ID = 'typeahead-menu'

export function isTypeaheadMenuOpen(): boolean {
  return typeof document !== 'undefined' && document.getElementById(TYPEAHEAD_MENU_ID) !== null
}

// The shared Enter choreography of both nested-editor surfaces: hand the Enter
// key to the parent editor. Registered at the surfaces' usual
// COMMAND_PRIORITY_LOW; the module header documents what deliberately stays
// with the callers and the registration-order contract between the two
// listeners when the nested-editor plugin composes this with its own
// ctrl/cmd+enter and focusNext branches.
//
// `parentEditor` is either the editor itself (the caption already holds it
// from composer context) or a resolver consulted per event (the nested-editor
// plugin reads the parent lazily from Lexical internals). A missing parent is
// a pass-through, matching the plugin's previous default-branch guard.
export function registerNestedEnterHandoff(
  editor: LexicalEditor,
  parentEditor: LexicalEditor | (() => LexicalEditor | null),
): () => void {
  return editor.registerCommand(
    KEY_ENTER_COMMAND,
    (event) => {
      // bail out when a typeahead menu is open so the menu can handle Enter
      // itself — see the module header for why this can't be priority-based
      if (isTypeaheadMenuOpen()) {
        return false
      }

      // allow shift+enter to create a line break
      if (event?.shiftKey) {
        return false
      }

      // the IME/mobile Enter path dispatches a null event — leave it to
      // Lexical's default Enter handling
      if (!event) {
        return false
      }

      const parent = typeof parentEditor === 'function' ? parentEditor() : parentEditor
      if (!parent) {
        return false
      }

      // otherwise, let the parent editor handle the enter key
      // - with ctrl/cmd+enter toggles edit mode
      // - or creates paragraph after card and moves cursor
      parent.dispatchCommand(KEY_ENTER_COMMAND, markEventFromNested(event))

      // prevent normal/InklingBehaviourPlugin enter key behaviour
      return true
    },
    COMMAND_PRIORITY_LOW,
  )
}

/**
 * The caption arrow hand-off (the third caption behaviour, completing the
 * provenance/enter/arrow trio this module's header names): arrow keys in a
 * caption editor re-dispatch to the parent editor — marked with caption
 * provenance so the parent's handlers can reselect the card — with the same
 * typeahead bail as the Enter hand-off (an open menu navigates instead).
 * Registered at COMMAND_PRIORITY_HIGH (the caption's arrows pre-empt the
 * shared LOW-priority handlers). One registration owns both arrow commands;
 * the caption plugin keeps only its FOCUS/BLUR focus-tracking pair.
 */
export function registerCaptionArrowHandoff(editor: LexicalEditor, parentEditor: LexicalEditor): () => void {
  const registerArrowHandoff = (command: LexicalCommand<KeyboardEvent>) =>
    editor.registerCommand(
      command,
      (event) => {
        // bail out when a typeahead menu is open so arrow keys navigate the
        // menu instead of moving focus to the next/parent editor
        if (isTypeaheadMenuOpen()) {
          return false
        }
        // handle moving focus at the parent editor level (select next card)
        parentEditor.dispatchCommand(command, markEventFromCaptionEditor(event))
        return true
      },
      COMMAND_PRIORITY_HIGH,
    )

  return mergeRegister(registerArrowHandoff(KEY_ARROW_UP_COMMAND), registerArrowHandoff(KEY_ARROW_DOWN_COMMAND))
}

/**
 * The blur half of the nested-editor boundary choreography: while a card's
 * settings panel is open, the parent editor cleared its selection when the
 * nested editor took focus — so on blur the parent card is reselected and
 * the panel keeps its anchor. Registered at the surfaces' usual
 * COMMAND_PRIORITY_LOW; claims the blur only when the settings-panel case
 * applies. The reselect is tagged history-merge so it never lands in undo
 * history. `parentEditor` is resolved per event, matching the Enter
 * hand-off's lazy resolver.
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

      // when the nested editor is selected, the parent editor clears its selection so we need to
      //   return parent editor selection to the card when the nested editor loses focus
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
          ) // don't include an undo history entry for this change of selection
        })

        return true
      }

      return false
    },
    COMMAND_PRIORITY_LOW,
  )
}

/**
 * The caption type-to-focus policy (the fourth caption behaviour, joining
 * the provenance/enter/arrow trio above): while the parent card is selected
 * and the caption is not focused, a printable keystroke — single character,
 * no ctrl/meta/alt, and NOT landing on an input or textarea — focuses the
 * caption editor. Document-level listener; returns the teardown. The ports
 * are read per event, so callers register once per state change cycle, not
 * per keystroke.
 */
export function registerCaptionTypeToFocus(
  editor: LexicalEditor,
  { isSelected, hasFocus }: { isSelected: () => boolean; hasFocus: () => boolean },
): () => void {
  const handleKeyDown = (event: KeyboardEvent) => {
    // don't focus caption input if card is not selected
    if (!isSelected()) {
      return
    }

    // don't focus caption input if any other input or textarea is focused
    const target = event.target
    if (target instanceof Element && target.matches('input, textarea')) {
      return
    }

    // only if key is printable key, focus on editor
    if (!hasFocus() && event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      editor.focus()
    }
  }

  document.addEventListener('keydown', handleKeyDown)
  return () => {
    document.removeEventListener('keydown', handleKeyDown)
  }
}
