/* The public barrel's shared contract, single-sourced so shared names have one
 * home. Must stay free of the card NODE classes: these are the card-free
 * composition pieces a card-free host surface consumes, and the pick-seam /
 * card-chrome exports below name only registry facts, contexts, and chrome
 * components. */

/* Types re-exported from bundled runtimes so consumers can name shapes that
 * appear in public prop/command signatures. */
export type { Transformer } from '@lexical/markdown'
export type { EditorState, LexicalEditor, SerializedEditorState } from 'lexical'

export type { InklingComposableEditorProps } from './components/InklingComposableEditor'
export type { InklingInitialEditorState } from './components/InklingComposerBase'
export type { InklingSurfaceProps } from './components/InklingSurface'
export type { ExternalControlAPI } from './plugins/ExternalControlPlugin'

/* Host-facing config types: the shapes a host names when wiring
 * <InklingComposer cardConfig={...} fileUploader={...}> and its callbacks. */
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
} from './context/InklingHostIntegrationContext'
export type { ListOptionItem, SearchResult } from './hooks/useSearchLinks'

/* Labels: the closed labels table a host overrides through
 * <InklingComposer labels={...}>, a prop on both entries. Host card menus ride
 * the `menu.host.*` namespace, opened on the input side only. */
export { DEFAULT_LABELS } from './labels/inkling-labels'
export type { InklingHostMenuLabelKey, InklingLabels, InklingLabelsInput } from './labels/inkling-labels'

/* Media library: the picker's headless state machine rides both entries, so a
 * host building its own library-backed card (e.g. music) reuses it. */
export { createLibraryBrowser } from './utils/services/library-browser'
export type {
  LibraryBrowser,
  LibraryBrowserIntent,
  LibraryBrowserSnapshot,
  LibraryScheduler,
} from './utils/services/library-browser'

/* Card-free composition pieces shared by both entries. */
export { default as InklingComposableEditor } from './components/InklingComposableEditor'
export { default as InklingSurface } from './components/InklingSurface'
export { CORE_PLUGINS, default as CorePlugins } from './plugins/CorePlugins'
export type { CorePluginEntry, CorePluginScope } from './plugins/CorePlugins'
export { default as RestrictContentPlugin } from './plugins/RestrictContentPlugin'

/* The pick seam: a host card declares its picker on the defineCard spec; the
 * card component opens it through `useCardPicker` and the picker host core
 * plugin renders it. A same-type VARIANT of a built-in card (no defineCard
 * spec — the nodeType collides) registers through `registerCardPicker`
 * instead; both channels share one dispatch. `useCardChrome` is the card chrome
 * prologue a host card's picker and editing chrome write through, and
 * `CardActionToolbar` is the selection-driven chrome host cards mount their
 * affordances on. */
export { useCardPicker } from './hooks/useCardPicker'
export type { CardPickerHandle } from './hooks/useCardPicker'
export { registerCardPicker } from './nodes/cards/host-card-registry'
export type { CardPickerRenderProps, HostCardPickerSpec } from './nodes/cards/host-card-registry'
export { useCardChrome } from './hooks/useCardChrome'
export type { CardChrome } from './hooks/useCardChrome'
export type { CardWriteOptions } from './hooks/useCardWriter'
export { CardActionToolbar } from './components/ui/CardActionToolbar'
export type { CardActionToolbarProps, CardToolbarItem } from './components/ui/CardActionToolbar'

/* Lexical's command-priority constants — a host intercepting a stock command
 * names the level instead of hardcoding the number. */
export {
  COMMAND_PRIORITY_CRITICAL,
  COMMAND_PRIORITY_EDITOR,
  COMMAND_PRIORITY_HIGH,
  COMMAND_PRIORITY_LOW,
  COMMAND_PRIORITY_NORMAL,
} from 'lexical'
/* Writing-focus mode: the plugin the `focusMode` surface prop mounts, plus the
 * class/attribute contract host CSS keys on. */
export { default as FocusModePlugin } from './plugins/FocusModePlugin'
export { FOCUS_ACTIVE_ATTRIBUTE, FOCUS_MODE_CLASS } from './plugins/behaviour/focus-mode'
export { default as BASIC_NODES } from './nodes/BasicNodes'
export { default as MINIMAL_NODES } from './nodes/MinimalNodes'
export { BASIC_TRANSFORMERS, MINIMAL_TRANSFORMERS } from './markdown/transformers-core'

export const version = __APP_VERSION__
