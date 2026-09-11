/* The shared contract of the two published entries (`.` and `./core`) —
 * single-sourced so the barrels cannot drift (their parity used to be kept
 * by convention, and no gate named most of these). Both barrels
 * `export * from` this module and keep only their entry-specific exports:
 * the `.` entry's cards/feature plugins/node sets and its defaulted
 * `InklingComposer`, the `./core` entry's required-nodes `InklingComposer`.
 * Everything here must stay card-free — `./core` is the card-free entry. */

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
 * prop on both entries. */
export { DEFAULT_LABELS } from '@/inkling/labels/inkling-labels'
export type { InklingLabels, InklingLabelsInput } from '@/inkling/labels/inkling-labels'

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
/* Writing-focus mode: the plugin the `focusMode` surface prop mounts and the
 * class/attribute contract host CSS keys on. */
export { default as FocusModePlugin } from '@/inkling/plugins/FocusModePlugin'
export { FOCUS_ACTIVE_ATTRIBUTE, FOCUS_MODE_CLASS } from '@/inkling/plugins/behaviour/focus-mode'
export { default as BASIC_NODES } from '@/inkling/nodes/BasicNodes'
export { default as MINIMAL_NODES } from '@/inkling/nodes/MinimalNodes'
export { BASIC_TRANSFORMERS, MINIMAL_TRANSFORMERS } from '@/inkling/markdown/transformers-core'

export const version = __APP_VERSION__
