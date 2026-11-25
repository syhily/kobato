import type { PinturaConfig } from '@kobato/inkling-internal/hooks/usePinturaEditor'
import type { ListOptionItem, SearchResult } from '@kobato/inkling-internal/hooks/useSearchLinks'
import type { TelemetryHandler } from '@kobato/inkling-internal/utils/analytics'

import { type ErrorInfo, type ReactNode, createContext, useContext, useMemo } from 'react'
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
  search: (query: string) => Promise<LibraryImageItem[] | undefined>

  upload?: () => Promise<LibraryImageItem | undefined>
}
export interface LibrarySettings {
  imageLibrary?: ImageLibrarySettings
}

export interface MathSettings {
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
  onError: (error: unknown, info: ErrorInfo) => void

  dragScrollContainerSelector?: string
}

export interface InklingHostEssentials {
  fileUploader: FileUploader
  onError: (error: unknown, info: ErrorInfo) => void
}
const InklingHostEssentialsContext = createContext<InklingHostEssentials>({
  fileUploader: {
    useFileUpload: () => ({ upload: () => Promise.resolve(undefined) }),
  },
  onError: () => undefined,
})
export function useInklingHostEssentials(): InklingHostEssentials {
  return useContext(InklingHostEssentialsContext)
}

const InklingGifSettingsContext = createContext<GifSettings>({})
const InklingLinkingSettingsContext = createContext<LinkingSettings>({})
const InklingSnippetSettingsContext = createContext<SnippetSettings>({})
const InklingUploadSettingsContext = createContext<UploadSettings>({})
const InklingMathSettingsContext = createContext<MathSettings>({})
const InklingLibrarySettingsContext = createContext<LibrarySettings>({})

export function useInklingGifSettings(): GifSettings {
  return useContext(InklingGifSettingsContext)
}

export function useInklingLinkingSettings(): LinkingSettings {
  return useContext(InklingLinkingSettingsContext)
}

export function useInklingSnippetSettings(): SnippetSettings {
  return useContext(InklingSnippetSettingsContext)
}

export function useInklingUploadSettings(): UploadSettings {
  return useContext(InklingUploadSettingsContext)
}

export function useInklingMathSettings(): MathSettings {
  return useContext(InklingMathSettingsContext)
}

export function useInklingLibrarySettings(): LibrarySettings {
  return useContext(InklingLibrarySettingsContext)
}

const InklingDragScrollContext = createContext<string | undefined>(undefined)

export function useInklingDragScrollContainerSelector(): string | undefined {
  return useContext(InklingDragScrollContext)
}

export function InklingHostIntegrationProvider({
  value,
  children,
}: {
  value: InklingHostIntegrationContextValue
  children: ReactNode
}) {
  const { cardConfig } = value

  const essentials = useMemo<InklingHostEssentials>(
    () => ({ fileUploader: value.fileUploader, onError: value.onError }),
    [value.fileUploader, value.onError],
  )
  const gifSettings = useMemo<GifSettings>(
    () => ({ klipy: cardConfig.klipy, tenor: cardConfig.tenor }),
    [cardConfig.klipy, cardConfig.tenor],
  )
  const linkingSettings = useMemo<LinkingSettings>(
    () => ({
      searchLinks: cardConfig.searchLinks,
      fetchAutocompleteLinks: cardConfig.fetchAutocompleteLinks,
      siteUrl: cardConfig.siteUrl,
      fetchEmbed: cardConfig.fetchEmbed,
    }),
    [cardConfig.searchLinks, cardConfig.fetchAutocompleteLinks, cardConfig.siteUrl, cardConfig.fetchEmbed],
  )
  const snippetSettings = useMemo<SnippetSettings>(
    () => ({
      snippets: cardConfig.snippets,
      createSnippet: cardConfig.createSnippet,
      deleteSnippet: cardConfig.deleteSnippet,
    }),
    [cardConfig.snippets, cardConfig.createSnippet, cardConfig.deleteSnippet],
  )
  const uploadSettings = useMemo<UploadSettings>(
    () => ({ image: cardConfig.image, pinturaConfig: cardConfig.pinturaConfig }),
    [cardConfig.image, cardConfig.pinturaConfig],
  )
  const mathSettings = useMemo<MathSettings>(() => ({ renderMath: cardConfig.renderMath }), [cardConfig.renderMath])
  const librarySettings = useMemo<LibrarySettings>(
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
