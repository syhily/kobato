/* The public barrel's shared contract, single-sourced so shared names have one
 * home. Must stay free of the card NODE classes: these are the card-free
 * composition pieces a card-free host surface consumes, and the pick-seam /
 * card-chrome exports below name only registry facts, contexts, and chrome
 * components. */

export type { Transformer } from '@lexical/markdown'
export type { EditorState, LexicalEditor, SerializedEditorState } from 'lexical'

export type { InklingComposableEditorProps } from '@kobato/inkling-internal/components/InklingComposableEditor'
export type { InklingInitialEditorState } from '@kobato/inkling-internal/components/InklingComposerBase'
export type { InklingSurfaceProps } from '@kobato/inkling-internal/components/InklingSurface'
export type { ExternalControlAPI } from '@kobato/inkling-internal/plugins/ExternalControlPlugin'

export type {
  BookmarkEmbedOptions,
  BookmarkEmbedResponse,
  CardConfig,
  FileUploader,
  FileUploaderInput,
  GifSettings,
  ImageLibrarySettings,
  LibraryImageItem,
  LibrarySettings,
  LinkingSettings,
  MathSettings,
  SnippetItem,
  SnippetSettings,
  UploadSettings,
} from '@kobato/inkling-internal/context/InklingHostIntegrationContext'
export type { ListOptionItem, SearchResult } from '@kobato/inkling-internal/hooks/useSearchLinks'

export { DEFAULT_LABELS } from '@kobato/inkling-internal/labels/inkling-labels'
export type {
  InklingHostMenuLabelKey,
  InklingLabels,
  InklingLabelsInput,
} from '@kobato/inkling-internal/labels/inkling-labels'

export { createLibraryBrowser } from '@kobato/inkling-internal/services/library-browser'
export type {
  LibraryBrowser,
  LibraryBrowserIntent,
  LibraryBrowserSnapshot,
  LibraryScheduler,
} from '@kobato/inkling-internal/services/library-browser'

export { default as InklingComposableEditor } from '@kobato/inkling-internal/components/InklingComposableEditor'
export { default as InklingSurface } from '@kobato/inkling-internal/components/InklingSurface'
export { CORE_PLUGINS, default as CorePlugins } from '@kobato/inkling-internal/plugins/CorePlugins'
export type { CorePluginEntry, CorePluginScope } from '@kobato/inkling-internal/plugins/CorePlugins'
export { default as RestrictContentPlugin } from '@kobato/inkling-internal/plugins/RestrictContentPlugin'

export { useCardPicker } from '@kobato/inkling-internal/hooks/useCardPicker'
export type { CardPickerHandle } from '@kobato/inkling-internal/hooks/useCardPicker'
export { registerCardPicker } from '@kobato/inkling-internal/nodes/cards/host-card-registry'
export type { CardPickerRenderProps, HostCardPickerSpec } from '@kobato/inkling-internal/nodes/cards/host-card-registry'
export { useCardChrome } from '@kobato/inkling-internal/hooks/useCardChrome'
export type { CardChrome } from '@kobato/inkling-internal/hooks/useCardChrome'
export type { CardWriteOptions } from '@kobato/inkling-internal/hooks/useCardWriter'
export { CardActionToolbar } from '@kobato/inkling-internal/components/ui/CardActionToolbar'
export type { CardActionToolbarProps, CardToolbarItem } from '@kobato/inkling-internal/components/ui/CardActionToolbar'
export {
  COMMAND_PRIORITY_CRITICAL,
  COMMAND_PRIORITY_EDITOR,
  COMMAND_PRIORITY_HIGH,
  COMMAND_PRIORITY_LOW,
  COMMAND_PRIORITY_NORMAL,
} from 'lexical'

export { default as FocusModePlugin } from '@kobato/inkling-internal/plugins/FocusModePlugin'
export { FOCUS_ACTIVE_ATTRIBUTE, FOCUS_MODE_CLASS } from '@kobato/inkling-internal/plugins/behaviour/focus-mode'
export { default as BASIC_NODES } from '@kobato/inkling-internal/nodes/BasicNodes'
export { default as MINIMAL_NODES } from '@kobato/inkling-internal/nodes/MinimalNodes'
export { BASIC_TRANSFORMERS, MINIMAL_TRANSFORMERS } from '@kobato/inkling-internal/markdown/transformers-core'

export const version = __APP_VERSION__
