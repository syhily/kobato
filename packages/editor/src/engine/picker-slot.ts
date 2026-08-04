import type { AdminImageDto } from '@kobato/shared/contracts/images'
import type { AdminMusicDto } from '@kobato/shared/contracts/music'
import type { ReactNode } from 'react'

/**
 * Picker renderer slot.
 *
 * The picker dialogs (media library / music) live on the admin side of
 * the ui layer — they talk to admin data surfaces (`orpcQuery`,
 * upload / add dialogs). The editor engine must not import them, so the
 * host (the editor screen) injects renderers through `PageBodyEditor`
 * props; they are surfaced to engine internals (node views, slash
 * commands) via `editor.storage.editorActions` — the same channel the
 * `openImagePicker`-style actions already use.
 */

export interface ImagePickerRenderProps {
  /** Optional trigger; when omitted the picker renders the dialog only (controlled open). */
  trigger?: ReactNode
  onPick: (image: AdminImageDto) => void
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

export type RenderImagePicker = (props: ImagePickerRenderProps) => ReactNode

export interface MusicPickerRenderProps {
  /** Optional trigger; when omitted the picker renders the dialog only (controlled open). */
  trigger?: ReactNode
  onPick: (music: AdminMusicDto) => void
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

export type RenderMusicPicker = (props: MusicPickerRenderProps) => ReactNode

export interface PickerSlotRenderers {
  renderImagePicker: RenderImagePicker
  renderMusicPicker: RenderMusicPicker
}
