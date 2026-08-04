import type { RenderImagePicker, RenderMusicPicker } from '@kobato/editor/engine/picker-slot'
import type { LexicalEditor } from 'lexical'

import { OPEN_IMAGE_PICKER_COMMAND, OPEN_MUSIC_PICKER_COMMAND } from '@kobato/editor/engine/lexical/commands'
import { COMMAND_PRIORITY_LOW } from 'lexical'

/**
 * Host-injected picker surface for the Lexical body editor.
 *
 * The picker dialogs (media library / music) live on the admin side of
 * the ui layer and must not be imported by the engine — the same
 * constraint as the tiptap engine's `pickerRenderers` slot. The host
 * registers its open-callbacks through `registerPickerHandlers`; the
 * editor translates `OPEN_*` commands into those callbacks, and the
 * `INSERT_*` commands (dispatched from the pickers' `onPick`) insert the
 * nodes. Node views read `renderImagePicker` / `renderMusicPicker` from
 * the same registry to render inline picker triggers.
 *
 * The registration returns an unsubscribe function; it is idempotent per
 * editor — a later registration replaces the earlier one.
 */

export interface PickerHandlers {
  /** Open the media-library picker dialog (host-owned). */
  openImagePicker: () => void
  /** Open the music picker dialog (host-owned). */
  openMusicPicker: () => void
  /** Render the media-library picker (dialog + optional trigger). */
  renderImagePicker?: RenderImagePicker
  /** Render the music picker (dialog + optional trigger). */
  renderMusicPicker?: RenderMusicPicker
}

const handlersByEditor = new WeakMap<LexicalEditor, PickerHandlers>()

export function registerPickerHandlers(editor: LexicalEditor, handlers: PickerHandlers): () => void {
  handlersByEditor.set(editor, handlers)
  const unregisterOpenImage = editor.registerCommand(
    OPEN_IMAGE_PICKER_COMMAND,
    () => {
      handlers.openImagePicker()
      return true
    },
    COMMAND_PRIORITY_LOW,
  )
  const unregisterOpenMusic = editor.registerCommand(
    OPEN_MUSIC_PICKER_COMMAND,
    () => {
      handlers.openMusicPicker()
      return true
    },
    COMMAND_PRIORITY_LOW,
  )
  return () => {
    unregisterOpenImage()
    unregisterOpenMusic()
    if (handlersByEditor.get(editor) === handlers) {
      handlersByEditor.delete(editor)
    }
  }
}

/** Current handlers for an editor, if any (node views read the renderers from here). */
export function getPickerHandlers(editor: LexicalEditor): PickerHandlers | undefined {
  return handlersByEditor.get(editor)
}
