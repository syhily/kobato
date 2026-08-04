import type { PickerSlotRenderers } from '@kobato/editor/engine/picker-slot'
import type { ReactNode, RefObject } from 'react'

/**
 * Body-editor props contract shared by every body engine implementation.
 *
 * `PageBodyEditor` (the tiptap engine, PT-native) and `LexicalBodyEditor`
 * (the Lexical engine) both implement this interface, so the host screen
 * can swap engines without changing its props shape — only the `TBody`
 * type parameter differs (`PortableTextBody` vs `LexicalBody`).
 *
 * The contract mirrors the historical `PageBodyEditorProps` field for
 * field; the generic parameter is the ONLY addition.
 */
export interface BodyEditorProps<TBody> {
  /** Initial body. Only read on first mount + when `bodyKey` changes. */
  initialBody: TBody
  /**
   * Identity of the body source. When this string changes the editor
   * resets its content from `initialBody` — use page id +
   * `clientRevisionToken` so page switches and accepted remote
   * revisions flush stale content.
   */
  bodyKey: string
  /** Fired on every editor update with the freshly-derived body. */
  onBodyChange: (body: TBody) => void
  /** When true, the editor becomes read-only. */
  disabled?: boolean
  /**
   * Live preview column layout: toolbar stays fixed above the scrollable
   * canvas. When false the toolbar scrolls inline and a floating
   * duplicate pins to the bottom center once it scrolls out of view.
   */
  livePreviewOpen?: boolean
  /**
   * Ref to the scrollable container so the parent shell can wire
   * bidirectional scroll sync with the live-preview pane.
   */
  scrollContainerRef?: RefObject<HTMLDivElement | null>
  /**
   * Action(s) rendered to the right of the floating toolbar (e.g. 发布草稿).
   * Pass `null` to hide; renders nothing while the floating toolbar is
   * hidden (live-preview mode, or before the operator has scrolled).
   */
  floatingActions?: ReactNode
  /**
   * Host-injected picker dialog renderers (media library / music).
   * The dialogs live on the admin side of the ui layer and must not be
   * imported by the engine; when omitted no pickers render.
   */
  pickerRenderers?: PickerSlotRenderers
}
