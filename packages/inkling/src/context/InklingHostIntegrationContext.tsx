import type { PinturaConfig } from '@kobato/inkling-internal/hooks/usePinturaEditor'
import type { ListOptionItem, SearchResult } from '@kobato/inkling-internal/hooks/useSearchLinks'
import type { TelemetryHandler } from '@kobato/inkling-internal/utils/analytics'

import React from 'react'

export interface FileUploader {
  useFileUpload: (type: 'image' | 'video' | 'audio' | 'file' | 'mediaThumbnail') => {
    isLoading?: boolean
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
  src: string

  alt?: string
  width?: number | null
  height?: number | null
  thumbhash?: string
  storagePath?: string
  imageId?: string
}

export interface ImageLibrarySettings {
  /**
   * Empty query = the default (unfiltered) listing, fetched immediately on
   * picker open; non-empty queries are debounced. `undefined` means
   * "transient failure / cancelled": the picker keeps its last items (the same
   * convention as LinkingSettings.searchLinks).
   */
  search: (query: string) => Promise<LibraryImageItem[] | undefined>

  upload?: () => Promise<LibraryImageItem | undefined>
}
export interface LibrarySettings {
  imageLibrary?: ImageLibrarySettings
}

export interface MathSettings {
  /**
   * The host's server-side render channel (kobato: oRPC admin.renderMath; the
   * 200ms debounce stays host-owned). In-editor previews only — the artifacts
   * persisted on the node are filled by the host's save pipeline and never
   * written back by the editor.
   */
  renderMath?: (args: { tex: string; display: boolean }) => Promise<{ mathml?: string; svg?: string; error?: string }>
}

export interface TelemetrySettings {
  telemetry?: TelemetryHandler
}

export interface CardConfig
  extends
    GifSettings,
    LinkingSettings,
    SnippetSettings,
    UploadSettings,
    MathSettings,
    LibrarySettings,
    TelemetrySettings {}

export interface InklingHostIntegrationContextValue {
  fileUploader: FileUploader
  cardConfig: CardConfig
  onError: (error: unknown, info: React.ErrorInfo) => void

  dragScrollContainerSelector?: string
}

export interface InklingHostEssentials {
  fileUploader: FileUploader
  onError: (error: unknown, info: React.ErrorInfo) => void
}
const InklingHostEssentialsContext = React.createContext<InklingHostEssentials>({
  fileUploader: {
    useFileUpload: () => ({ upload: () => Promise.resolve(undefined) }),
  },
  onError: () => undefined,
})
export function useInklingHostEssentials(): InklingHostEssentials {
  return React.useContext(InklingHostEssentialsContext)
}

const InklingGifSettingsContext = React.createContext<GifSettings>({})
const InklingLinkingSettingsContext = React.createContext<LinkingSettings>({})
const InklingSnippetSettingsContext = React.createContext<SnippetSettings>({})
const InklingUploadSettingsContext = React.createContext<UploadSettings>({})
const InklingMathSettingsContext = React.createContext<MathSettings>({})
const InklingLibrarySettingsContext = React.createContext<LibrarySettings>({})

export function useInklingGifSettings(): GifSettings {
  return React.useContext(InklingGifSettingsContext)
}

export function useInklingLinkingSettings(): LinkingSettings {
  return React.useContext(InklingLinkingSettingsContext)
}

export function useInklingSnippetSettings(): SnippetSettings {
  return React.useContext(InklingSnippetSettingsContext)
}

export function useInklingUploadSettings(): UploadSettings {
  return React.useContext(InklingUploadSettingsContext)
}

export function useInklingMathSettings(): MathSettings {
  return React.useContext(InklingMathSettingsContext)
}

export function useInklingLibrarySettings(): LibrarySettings {
  return React.useContext(InklingLibrarySettingsContext)
}

const InklingDragScrollContext = React.createContext<string | undefined>(undefined)

export function useInklingDragScrollContainerSelector(): string | undefined {
  return React.useContext(InklingDragScrollContext)
}

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
