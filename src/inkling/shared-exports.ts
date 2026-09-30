/* The shared contract of the public barrel — single-sourced so shared names
 * have one home (no gate named most of these). The barrel `export * from`s
 * this module and keeps only its entry-specific exports: the card family,
 * feature plugins, node sets, and the defaulted `InklingComposer`.
 * Everything here must stay free of the card NODE classes — the card-free
 * composition pieces (InklingComposerBase and friends) are the subset a
 * card-free host surface consumes; the pick-seam/card-chrome exports below
 * name only registry facts, contexts, and chrome components, so they never
 * drag the card declarations into a card-free graph. */

/* Types re-exported from bundled runtimes so consumers can name the shapes
 * that appear in public prop/command signatures without installing Lexical. */
export type { Transformer } from '@lexical/markdown'
export type { EditorState, LexicalEditor, SerializedEditorState } from 'lexical'

export type { InklingComposableEditorProps } from '@/inkling/components/InklingComposableEditor'
export type { InklingInitialEditorState } from '@/inkling/components/InklingComposerBase'
export type { InklingSurfaceProps } from '@/inkling/components/InklingSurface'
export type { ExternalControlAPI } from '@/inkling/plugins/ExternalControlPlugin'

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
} from '@/inkling/context/InklingHostIntegrationContext'
export type { ListOptionItem, SearchResult } from '@/inkling/hooks/useSearchLinks'

/* Labels: the closed labels table a host
 * overrides through <InklingComposer labels={...}> — `labels` is a composer
 * prop on both entries. Host card menu labels ride the `menu.host.*`
 * namespace (`InklingHostMenuLabelKey`), opened on the input side only. */
export { DEFAULT_LABELS } from '@/inkling/labels/inkling-labels'
export type { InklingHostMenuLabelKey, InklingLabels, InklingLabelsInput } from '@/inkling/labels/inkling-labels'

/* Media library: the picker's headless state
 * machine rides both entries — a host building its own library-backed card
 * (e.g. music) on either composer reuses it. */
export { createLibraryBrowser } from '@/inkling/utils/services/library-browser'
export type {
  LibraryBrowser,
  LibraryBrowserIntent,
  LibraryBrowserSnapshot,
  LibraryScheduler,
} from '@/inkling/utils/services/library-browser'

/* Card-free composition pieces shared by both entries. */
export { default as InklingComposableEditor } from '@/inkling/components/InklingComposableEditor'
export { default as InklingSurface } from '@/inkling/components/InklingSurface'
export { CORE_PLUGINS, default as CorePlugins } from '@/inkling/plugins/CorePlugins'
export type { CorePluginEntry, CorePluginScope } from '@/inkling/plugins/CorePlugins'
export { default as RestrictContentPlugin } from '@/inkling/plugins/RestrictContentPlugin'

/* The pick seam (CONTEXT.md: "pick seam"): a host card declares its picker on
 * the defineCard spec; the card component opens it through `useCardPicker`
 * and the picker host core plugin renders it. `useCardChrome` is the card
 * chrome prologue (editor + the card write seam) a host card's picker render
 * and editing chrome write through, and `CardActionToolbar` is the layer's
 * selection-driven card chrome the host card mounts its affordances on. */
export { useCardPicker } from '@/inkling/hooks/useCardPicker'
export type { CardPickerHandle } from '@/inkling/hooks/useCardPicker'
export type { CardPickerRenderProps, HostCardPickerSpec } from '@/inkling/nodes/cards/host-card-registry'
export { useCardChrome } from '@/inkling/hooks/useCardChrome'
export type { CardChrome } from '@/inkling/hooks/useCardChrome'
export { CardActionToolbar } from '@/inkling/components/ui/CardActionToolbar'
export type { CardActionToolbarProps, CardToolbarItem } from '@/inkling/components/ui/CardActionToolbar'
/* Writing-focus mode: the plugin the `focusMode` surface prop mounts and the
 * class/attribute contract host CSS keys on. */
export { default as FocusModePlugin } from '@/inkling/plugins/FocusModePlugin'
export { FOCUS_ACTIVE_ATTRIBUTE, FOCUS_MODE_CLASS } from '@/inkling/plugins/behaviour/focus-mode'
export { default as BASIC_NODES } from '@/inkling/nodes/BasicNodes'
export { default as MINIMAL_NODES } from '@/inkling/nodes/MinimalNodes'
export { BASIC_TRANSFORMERS, MINIMAL_TRANSFORMERS } from '@/inkling/markdown/transformers-core'

export const version = __APP_VERSION__
