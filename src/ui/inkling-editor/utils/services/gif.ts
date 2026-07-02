import debounce from 'lodash/debounce'
import { useRef, useState } from 'react'

const API_VERSION = 'v2'
const DEBOUNCE_MS = 600

const PROVIDER_API_URLS: Record<string, string> = {
  klipy: 'https://api.klipy.com',
  tenor: 'https://tenor.googleapis.com',
}

export const ERROR_TYPE: Record<string, string> = {
  COMMON: 'common',
  INVALID_API_KEY: 'invalid_key',
}

export interface GifProviderConfig {
  provider: string
  apiUrl: string
  apiKey: string
  contentFilter: string
}

interface GifConfig {
  apiKey?: string
  googleApiKey?: string
  contentFilter?: string
}

interface CardConfigLike {
  klipy?: GifConfig
  tenor?: GifConfig
}

export function getGifProviderConfig(cardConfig: CardConfigLike | null | undefined): GifProviderConfig | null {
  if (cardConfig?.klipy?.apiKey) {
    return {
      provider: 'klipy',
      apiUrl: PROVIDER_API_URLS.klipy,
      apiKey: cardConfig.klipy.apiKey,
      contentFilter: cardConfig.klipy.contentFilter || 'off',
    }
  }
  if (cardConfig?.tenor?.googleApiKey) {
    return {
      provider: 'tenor',
      apiUrl: PROVIDER_API_URLS.tenor,
      apiKey: cardConfig.tenor.googleApiKey,
      contentFilter: cardConfig.tenor.contentFilter || 'off',
    }
  }
  return null
}

interface GifErrorResponse {
  error?: { message?: string } | string
  errors?: { message?: string[] | string }
}

export function extractErrorMessage(json: GifErrorResponse | null | undefined): string {
  const klipyMessage = json?.errors?.message
  const err = json?.error
  return (
    (typeof err === 'object' && err?.message) ||
    (typeof err === 'string' ? err : '') ||
    (Array.isArray(klipyMessage) ? klipyMessage[0] : klipyMessage) ||
    'Unknown error'
  )
}

export function isInvalidKeyError(message: string | null | undefined): boolean {
  const text = message || ''
  return /api key/i.test(text) && /(invalid|not valid)/i.test(text)
}

interface MediaFormat {
  dims: [number, number]
  url?: string
}

export interface GifData {
  id: string
  media_formats: {
    tinygif?: MediaFormat
    gif?: MediaFormat
  }
  ratio?: number
  index?: number
  columnIndex?: number
  columnRowIndex?: number
  [key: string]: unknown
}

interface GifResponse {
  results: GifData[]
  next?: string
}

interface UseGifOptions {
  config: GifProviderConfig
}

export interface UseGifResult {
  updateSearch: (term?: string) => void
  isLoading: boolean
  isLazyLoading: boolean
  error: string | null
  loadNextPage: () => Promise<void> | undefined
  columns: GifData[][]
  changeColumnCount: (count: number) => void
  gifs: GifData[]
}

export function useGif({ config }: UseGifOptions): UseGifResult {
  const [columns, setColumns] = useState<GifData[][]>([])
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setLoading] = useState<boolean>(false)
  const [isLazyLoading, setLazyLoading] = useState<boolean>(false)
  const [gifs, setGifs] = useState<GifData[]>([])

  const nextPos = useRef<string | null>(null)
  const loadedType = useRef<string>('')
  const columnHeights = useRef<number[]>([])
  const lastRequestArgs = useRef<IArguments | null>(null)
  const searchTerm = useRef<string>('')
  const columnCount = useRef<number>(4)
  const internalStateColumns = useRef<GifData[][]>([])
  const internalStateGifs = useRef<GifData[]>([])

  function search(term: string): Promise<void> | undefined {
    searchTerm.current = term
    reset()

    if (term) {
      return searchTask(term)
    } else {
      return loadTrendingGifs()
    }
  }

  const updateSearch = debounce((term = '') => search(term), DEBOUNCE_MS)

  async function searchTask(term: string): Promise<void> {
    loadedType.current = 'search'
    await makeRequest(loadedType.current, {
      params: {
        q: term,
        media_filter: 'tinygif,gif',
      },
    })
  }

  async function loadTrendingGifs(): Promise<void> {
    loadedType.current = 'featured'
    await makeRequest(loadedType.current, {
      params: {
        q: 'excited',
        media_filter: 'tinygif,gif',
      },
    })
  }

  function reset(): void {
    internalStateGifs.current = []
    nextPos.current = null
    resetColumns()
  }

  function resetColumns(): void {
    const newColumns: GifData[][] = []
    const newColumnHeights: number[] = []

    for (let i = 0; i < columnCount.current; i += 1) {
      newColumns[i] = []
      newColumnHeights[i] = 0
    }

    internalStateColumns.current = newColumns
    columnHeights.current = newColumnHeights

    if (internalStateGifs.current.length) {
      adjustToNewColumnCount()
    }
  }

  function adjustToNewColumnCount(): void {
    internalStateGifs.current.forEach((gif) => {
      addGifToColumns(gif)
    })
  }

  function addGifToColumns(gif: GifData): void {
    const min = Math.min(...columnHeights.current)
    const colIdx = columnHeights.current.indexOf(min)

    columnHeights.current[colIdx] += 300 * (gif.ratio ?? 1)
    internalStateColumns.current[colIdx].push(gif)

    gif.columnIndex = colIdx
    gif.columnRowIndex = internalStateColumns.current[colIdx].length - 1
  }

  function addGif(gif: GifData, gifIndex: number): void {
    const tinygif = gif.media_formats.tinygif
    if (tinygif) {
      const [width, height] = tinygif.dims
      gif.ratio = width > 0 ? height / width : 1
    } else {
      gif.ratio = 1
    }

    internalStateGifs.current.push(gif)
    gif.index = gifIndex
    addGifToColumns(gif)
  }

  function getContentFilter(): string {
    return config.contentFilter || 'off'
  }

  function changeColumnCount(count: number): void {
    columnCount.current = count
    resetColumns()
    setColumns(internalStateColumns.current)
  }

  async function makeRequest(
    path: string,
    options: { params: Record<string, string>; ignoreErrors?: boolean },
  ): Promise<void> {
    const versionedPath = `${API_VERSION}/${path}`.replace(/\/+/, '/')
    const url = new URL(versionedPath, config.apiUrl)

    const params = new URLSearchParams(options.params)
    params.set('key', config.apiKey)
    params.set('client_key', 'inkling-editor')
    params.set('contentfilter', getContentFilter())

    url.search = params.toString()

    lastRequestArgs.current = arguments

    setError(null)
    setLoading(true)

    try {
      const response = await fetch(url)
      if (response.status >= 200 && response.status < 300) {
        const json = (await response.json()) as GifResponse
        nextPos.current = json.next ?? null
        const newGifs = json.results
        newGifs.forEach((gif, index) => addGif(gif, index))

        setColumns(internalStateColumns.current)
        setGifs(internalStateGifs.current)
      } else {
        const contentType = response.headers.get('content-type') || ''
        let responseText: string
        if (contentType.startsWith('application/json')) {
          const json = (await response.json()) as GifErrorResponse
          responseText = extractErrorMessage(json)
        } else {
          responseText = await response.text()
        }

        setError(responseText)
        if (!options.ignoreErrors) {
          throw new Error(responseText)
        }
      }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Unknown error'
      if (!options.ignoreErrors) {
        setError(isInvalidKeyError(message) ? ERROR_TYPE.INVALID_API_KEY : ERROR_TYPE.COMMON)
      }
    } finally {
      setLoading(false)
      setLazyLoading(false)
    }
  }

  function loadNextPage(): Promise<void> | undefined {
    if (isLoading) {
      return
    }

    if (!internalStateGifs.current.length) {
      return loadTrendingGifs()
    }

    if (nextPos.current !== null) {
      const params: Record<string, string> = {
        pos: nextPos.current ?? '',
        media_filter: 'tinygif,gif',
      }

      if (loadedType.current === 'search') {
        params.q = searchTerm.current
      }

      setLazyLoading(true)

      return makeRequest(loadedType.current, { params })
    }
  }

  return {
    updateSearch,
    isLoading,
    isLazyLoading,
    error,
    loadNextPage,
    columns,
    changeColumnCount,
    gifs,
  }
}
