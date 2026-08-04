import type { AdminImageDto } from '@kobato/shared/contracts/images'
import type { AdminMusicDto } from '@kobato/shared/contracts/music'

import { createCommand, type LexicalCommand } from 'lexical'

/** Payload of the toolbar/selection link apply (`TOGGLE_LINK_COMMAND`). */
export interface ToggleLinkPayload {
  /** Link target URL (already trimmed / validated by the caller). */
  url: string
  /**
   * Display text — when set, inserts a new linked text run at the caret
   * (toolbar variant); when null, applies the link to the current
   * selection (selection variant). An empty string unlinks the range.
   */
  text?: string
  /** Render the link in a new tab (`target="_blank" rel="noreferrer noopener"`). */
  openInNewTab: boolean
}

/**
 * Editor commands for the body dialect (Lexical engine).
 *
 * `INSERT_*` commands carry the picked entity payload — dispatched by the
 * host's picker dialogs (the `onPick` of the injected renderers) and
 * handled inside the editor, which inserts the corresponding node at the
 * current selection. `OPEN_*` commands are dispatched by editor-internal
 * surfaces (node views, future toolbar) and handled by the host handlers
 * registered via `registerPickerHandlers` — the reverse direction.
 *
 * R3a ships the command surface + the host registration face; the
 * toolbar buttons that dispatch `OPEN_*` arrive with the R3b toolbar.
 */

/** Insert an `ImageNode` from a picked media-library asset. */
export const INSERT_IMAGE_COMMAND: LexicalCommand<AdminImageDto> = createCommand('INSERT_IMAGE_COMMAND')

/** Insert a `MusicPlayerNode` from a picked music asset. */
export const INSERT_MUSIC_COMMAND: LexicalCommand<AdminMusicDto> = createCommand('INSERT_MUSIC_COMMAND')

/** Ask the host to open the media-library picker dialog. */
export const OPEN_IMAGE_PICKER_COMMAND: LexicalCommand<void> = createCommand('OPEN_IMAGE_PICKER_COMMAND')

/** Ask the host to open the music picker dialog. */
export const OPEN_MUSIC_PICKER_COMMAND: LexicalCommand<void> = createCommand('OPEN_MUSIC_PICKER_COMMAND')

/** Insert a horizontal rule at the caret (R3b toolbar / slash menu). */
export const INSERT_HORIZONTAL_RULE_COMMAND: LexicalCommand<void> = createCommand('INSERT_HORIZONTAL_RULE_COMMAND')

/** Apply / insert / remove a link (toolbar + bubble menu share this surface). */
export const TOGGLE_LINK_COMMAND: LexicalCommand<ToggleLinkPayload> = createCommand('TOGGLE_LINK_COMMAND')

/** Ask the footnote loop (host-owned dialog state) to open the insert dialog. */
export const OPEN_FOOTNOTE_DIALOG_COMMAND: LexicalCommand<void> = createCommand('OPEN_FOOTNOTE_DIALOG_COMMAND')
