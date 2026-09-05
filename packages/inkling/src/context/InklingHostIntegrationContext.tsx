import React from 'react'

import type { PinturaConfig } from '@/hooks/usePinturaEditor'
import type { ListOptionItem, SearchResult } from '@/hooks/useSearchLinks'
import type { TelemetryHandler } from '@/utils/analytics'

export interface FileUploader {
  useFileUpload: (type: 'image' | 'video' | 'audio' | 'file' | 'mediaThumbnail') => {
    isLoading?: boolean
    // `fileName` lets multi-file uploads (gallery) map results back to the
    // original file — the reference host (demo/utils/useFileUpload.ts) always
    // returns it, and `GalleryNodeComponent` reads it
    upload: (
      files: FileList | File[],
      options?: { formData?: Record<string, string> },
    ) => Promise<Array<{ url?: string; fileName?: string }> | undefined>
    errors?: Error[]
  }
  fileTypes?: {
    image?: { mimeTypes: string[] }
    video?: { mimeTypes: string[] }
    audio?: { mimeTypes: string[] }
    file?: { mimeTypes: string[] }
  }
}

// accepted by <InklingComposer>: a full uploader, a partial one missing the
// `useFileUpload` hook (a fallback is installed), or any legacy object
export type FileUploaderInput = Partial<FileUploader> | Record<string, unknown>

export interface GifSettings {
  klipy?: { apiKey?: string; contentFilter?: string }
  tenor?: { googleApiKey?: string; contentFilter?: string }
}

export interface SnippetItem {
  name: string
  value: string
}

export interface SnippetSettings {
  snippets?: SnippetItem[]
  createSnippet?: (args: SnippetItem) => void | Promise<void>
  deleteSnippet?: (args: SnippetItem) => void | Promise<void>
}

export interface BookmarkEmbedOptions {
  type: 'bookmark'
}

export interface BookmarkEmbedResponse {
  url: string
  metadata: {
    author: string
    icon: string
    title: string
    description: string
    publisher: string
    thumbnail: string
  }
}

export interface LinkingSettings {
  searchLinks?: (term?: string) => Promise<SearchResult[] | undefined>
  fetchAutocompleteLinks?: () => Promise<ListOptionItem[] | undefined>
  siteUrl?: string
  fetchEmbed?: (href: string, options: BookmarkEmbedOptions) => Promise<BookmarkEmbedResponse | undefined>
}

export interface UploadSettings {
  image?: { allowedWidths?: string[] }
  pinturaConfig?: PinturaConfig
}

export interface LibraryImageItem {
  /** Card `src`. kobato: AdminImageDto.publicUrl */
  src: string
  /** Card `alt`. kobato: AdminImageDto.note ?? '' */
  alt?: string
  width?: number | null
  height?: number | null
  /* Host-schema pass-through keys: carried on the insert dataset, ignored by
     the stock image declaration, persisted only when the host's own card
     declaration declares them as properties (CONTEXT.md: "host card"). */
  thumbhash?: string
  storagePath?: string
  imageId?: string
}

export interface ImageLibrarySettings {
  /**
   * Empty query = the default (unfiltered) listing, fetched immediately on
   * picker open; non-empty queries are debounced. Resolving `undefined`
   * means "transient failure / cancelled" — the picker keeps its last items
   * (same convention as LinkingSettings.searchLinks).
   */
  search: (query: string) => Promise<LibraryImageItem[] | undefined>
  /**
   * Optional in-picker upload entry. The host owns the whole upload UX
   * (e.g. kobato's UploadImageDialog, which creates the library row) and
   * resolves with the uploaded item — treated as the selection — or
   * `undefined` when cancelled. Absent = no upload button.
   */
  upload?: () => Promise<LibraryImageItem | undefined>
}

export interface LibrarySettings {
  /**
   * The host's image media library. Present =
   * the image card's menu gains an "Image library" entry opening the picker.
   * The three host-schema keys (`thumbhash`/`storagePath`/`imageId`) ride the
   * insert dataset and are silently ignored by the stock image declaration —
   * they persist only when the host declares them as properties on its own
   * card declaration.
   */
  imageLibrary?: ImageLibrarySettings
}

export interface MathSettings {
  /**
   * The host's server-side render channel (kobato: oRPC admin.renderMath;
   * the 200ms debounce stays host-owned). Used for in-editor previews only —
   * the artifacts persisted on the node are filled by the host's save
   * pipeline, never written back by the editor.
   */
  renderMath?: (args: { tex: string; display: boolean }) => Promise<{ mathml?: string; svg?: string; error?: string }>
}

export interface TelemetrySettings {
  /**
   * The host's telemetry handler (CONTEXT.md: "host config"). The editor's
   * `trackEvent` events route here instead of the default adapter (the
   * plausible/posthog fan-out). Page-global by nature — analytics abstracts
   * window-global vendors — so the last registered handler wins page-wide.
   */
  telemetry?: TelemetryHandler
}

// The host's card-behaviour contract, closed (plan 048): every key the editor
// reads is declared on a per-area slice and nothing else is accepted, so
// renaming or tightening a key breaks host code loudly at compile time.
export interface CardConfig
  extends
    GifSettings,
    LinkingSettings,
    SnippetSettings,
    UploadSettings,
    MathSettings,
    LibrarySettings,
    TelemetrySettings {}

// Host-integration lifecycle (plan 047): the values the host application
// hands the editor — uploads, card behaviour flags, and the error sink.
// This is the WHOLE-value transport shape: the composer props and the
// `InklingHostIntegrationProvider` facade speak it, but no component
// subscribes to it — consumers subscribe to the per-lifecycle channels
// below (plan C4), so one feature config's identity change re-renders only
// that feature's consumers instead of every host-integration consumer.
export interface InklingHostIntegrationContextValue {
  fileUploader: FileUploader
  cardConfig: CardConfig
  onError: (error: unknown, info: React.ErrorInfo) => void
  /**
   * The host's drag auto-scroll container selector (the composer's
   * `dragScrollContainerSelector` prop): when a drag's only scrollable
   * ancestor is the document, the drag-scroll prefers the element matching
   * this selector. Absent, the document scrolling element is used as found.
   */
  dragScrollContainerSelector?: string
}

/* The editor-level channel: the uploader and the error sink — stable for
 * the editor's lifetime (the `useFileUpload` identity contract in
 * src/hooks/useMediaCardUpload.ts), so one context serves every consumer. */
export interface InklingHostEssentials {
  fileUploader: FileUploader
  onError: (error: unknown, info: React.ErrorInfo) => void
}

const InklingHostEssentialsContext = React.createContext<InklingHostEssentials>({
  fileUploader: {
    useFileUpload: () => ({ upload: () => Promise.resolve(undefined) }),
  },
  onError: () => {},
})

/** The editor-level channel: the host's file uploader and error sink. */
export function useInklingHostEssentials(): InklingHostEssentials {
  return React.useContext(InklingHostEssentialsContext)
}

/* The feature-level channels: one context per CardConfig slice (telemetry
 * excepted — it never enters a context; the composer reads it from props
 * and hands it to the page-global telemetry port directly). A slice's
 * identity changing re-renders only that channel's consumers. */
const InklingGifSettingsContext = React.createContext<GifSettings>({})
const InklingLinkingSettingsContext = React.createContext<LinkingSettings>({})
const InklingSnippetSettingsContext = React.createContext<SnippetSettings>({})
const InklingUploadSettingsContext = React.createContext<UploadSettings>({})
const InklingMathSettingsContext = React.createContext<MathSettings>({})
const InklingLibrarySettingsContext = React.createContext<LibrarySettings>({})

/** The GIF feature channel (`klipy`/`tenor` provider config). */
export function useInklingGifSettings(): GifSettings {
  return React.useContext(InklingGifSettingsContext)
}

/** The linking feature channel (link search/autocomplete, site URL, bookmark embed). */
export function useInklingLinkingSettings(): LinkingSettings {
  return React.useContext(InklingLinkingSettingsContext)
}

/** The snippet feature channel (snippet list and create/delete callbacks). */
export function useInklingSnippetSettings(): SnippetSettings {
  return React.useContext(InklingSnippetSettingsContext)
}

/** The upload feature channel (image widths, the Pintura editor config). */
export function useInklingUploadSettings(): UploadSettings {
  return React.useContext(InklingUploadSettingsContext)
}

/** The math feature channel (the host's server-side render callback). */
export function useInklingMathSettings(): MathSettings {
  return React.useContext(InklingMathSettingsContext)
}

/** The media-library feature channel (the host's image library). */
export function useInklingLibrarySettings(): LibrarySettings {
  return React.useContext(InklingLibrarySettingsContext)
}

/* The drag-scroll narrow channel: a single consumer
 * (DragDropReorderPlugin), so it rides its own context instead of
 * re-rendering the editor-level channel's consumers on identity changes. */
const InklingDragScrollContext = React.createContext<string | undefined>(undefined)

/** The host's drag auto-scroll container selector (undefined = the document default). */
export function useInklingDragScrollContainerSelector(): string | undefined {
  return React.useContext(InklingDragScrollContext)
}

/**
 * The whole-value facade over the per-lifecycle channels: the composer
 * (and tests, which build whole values through
 * `test/utils/host-integration-context.ts`) mounts this once; every slice
 * is memoized on its own leaf references, so a host rebuilding `cardConfig`
 * every render only invalidates the channels whose leaves actually
 * changed. `cardConfig.telemetry` is deliberately dropped here — telemetry
 * is page-global and stays a composer-prop concern
 * (src/components/InklingComposerBase.tsx).
 */
export function InklingHostIntegrationProvider({
  value,
  children,
}: {
  value: InklingHostIntegrationContextValue
  children: React.ReactNode
}) {
  const { cardConfig } = value

  const essentials = React.useMemo<InklingHostEssentials>(
    () => ({ fileUploader: value.fileUploader, onError: value.onError }),
    [value.fileUploader, value.onError],
  )
  const gifSettings = React.useMemo<GifSettings>(
    () => ({ klipy: cardConfig.klipy, tenor: cardConfig.tenor }),
    [cardConfig.klipy, cardConfig.tenor],
  )
  const linkingSettings = React.useMemo<LinkingSettings>(
    () => ({
      searchLinks: cardConfig.searchLinks,
      fetchAutocompleteLinks: cardConfig.fetchAutocompleteLinks,
      siteUrl: cardConfig.siteUrl,
      fetchEmbed: cardConfig.fetchEmbed,
    }),
    [cardConfig.searchLinks, cardConfig.fetchAutocompleteLinks, cardConfig.siteUrl, cardConfig.fetchEmbed],
  )
  const snippetSettings = React.useMemo<SnippetSettings>(
    () => ({
      snippets: cardConfig.snippets,
      createSnippet: cardConfig.createSnippet,
      deleteSnippet: cardConfig.deleteSnippet,
    }),
    [cardConfig.snippets, cardConfig.createSnippet, cardConfig.deleteSnippet],
  )
  const uploadSettings = React.useMemo<UploadSettings>(
    () => ({ image: cardConfig.image, pinturaConfig: cardConfig.pinturaConfig }),
    [cardConfig.image, cardConfig.pinturaConfig],
  )
  const mathSettings = React.useMemo<MathSettings>(
    () => ({ renderMath: cardConfig.renderMath }),
    [cardConfig.renderMath],
  )
  const librarySettings = React.useMemo<LibrarySettings>(
    () => ({ imageLibrary: cardConfig.imageLibrary }),
    [cardConfig.imageLibrary],
  )

  return (
    <InklingHostEssentialsContext.Provider value={essentials}>
      <InklingGifSettingsContext.Provider value={gifSettings}>
        <InklingLinkingSettingsContext.Provider value={linkingSettings}>
          <InklingSnippetSettingsContext.Provider value={snippetSettings}>
            <InklingUploadSettingsContext.Provider value={uploadSettings}>
              <InklingMathSettingsContext.Provider value={mathSettings}>
                <InklingLibrarySettingsContext.Provider value={librarySettings}>
                  <InklingDragScrollContext.Provider value={value.dragScrollContainerSelector}>
                    {children}
                  </InklingDragScrollContext.Provider>
                </InklingLibrarySettingsContext.Provider>
              </InklingMathSettingsContext.Provider>
            </InklingUploadSettingsContext.Provider>
          </InklingSnippetSettingsContext.Provider>
        </InklingLinkingSettingsContext.Provider>
      </InklingGifSettingsContext.Provider>
    </InklingHostEssentialsContext.Provider>
  )
}
