import {
  BASIC_NODES,
  BASIC_TRANSFORMERS,
  type CardConfig,
  DEFAULT_NODES,
  type ExternalControlAPI,
  type FileUploader,
  InklingComposableEditor,
  InklingComposer,
  InklingEditor,
  MINIMAL_NODES,
  MINIMAL_TRANSFORMERS,
  RestrictContentPlugin,
  type SearchResult,
  TKCountPlugin,
  WordCountPlugin,
} from '@kobato/inkling'
import DollarIcon from '@kobato/inkling-demo/assets/icons/inkling-dollar.svg?react'
import LockIcon from '@kobato/inkling-demo/assets/icons/inkling-lock.svg?react'
import DarkModeToggle from '@kobato/inkling-demo/components/DarkModeToggle'
import { DemoChrome, useDemoSidebar } from '@kobato/inkling-demo/components/DemoChrome'
import FeatureChecklist from '@kobato/inkling-demo/components/FeatureChecklist'
import InitialContentToggle from '@kobato/inkling-demo/components/InitialContentToggle'
import { musicPlayer } from '@kobato/inkling-demo/components/MusicPlayerCard'
import TitleTextBox from '@kobato/inkling-demo/components/TitleTextBox'
import WordCount from '@kobato/inkling-demo/components/WordCount'
import basicContent from '@kobato/inkling-demo/content/basic-content.json'
import content from '@kobato/inkling-demo/content/content.json'
import minimalContent from '@kobato/inkling-demo/content/minimal-content.json'
import { fileTypes, useFileUpload } from '@kobato/inkling-demo/hooks/use-file-upload'
import { useFocusBelowCanvas } from '@kobato/inkling-demo/hooks/use-focus-below-canvas'
import { useSnippets } from '@kobato/inkling-demo/hooks/use-snippets'
import { fetchEmbed } from '@kobato/inkling-demo/utils/fetchEmbed'
import { klipyConfig, tenorConfig } from '@kobato/inkling-demo/utils/gifConfig'
import { getDemoImageLibrary } from '@kobato/inkling-demo/utils/imageLibrary'
import { ZH_LABELS } from '@kobato/inkling-demo/utils/labels'
import EarthIcon from '@kobato/inkling/assets/icons/inkling-earth.svg?react'
import React, { useState } from 'react'
import { useLocation, useSearchParams } from 'react-router'

const url = new URL(window.location.href)
const params = new URLSearchParams(url.search)
const WEBSOCKET_ENDPOINT = params.get('multiplayerEndpoint') || 'ws://localhost:1234'
const WEBSOCKET_ID = params.get('multiplayerId') || '0'

// e2e seam: `?renderMath=stub` installs a deterministic stand-in for the host's server-side KaTeX channel, so the
// math card's preview flow is exercised without a backend. The default demo host has no renderMath — its preview
// shows the TeX source.
const stubRenderMath: NonNullable<CardConfig['renderMath']> = () =>
  Promise.resolve({
    svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 16" width="40" height="16" data-math-stub="true"><rect width="40" height="16" fill="currentColor"/></svg>',
  })

const defaultCardConfig: CardConfig = {
  fetchEmbed: async (href, options) => {
    const response = await fetchEmbed(href, options)
    return response && 'metadata' in response ? response : undefined
  },
  tenor: tenorConfig ?? undefined,
  klipy: klipyConfig ?? undefined,
  fetchAutocompleteLinks: () =>
    Promise.resolve([
      { label: 'Homepage', value: window.location.origin + '/', Icon: EarthIcon, highlight: false, type: 'url' },
      {
        label: 'Free signup',
        value: window.location.origin + '/#/portal/signup/free',
        Icon: EarthIcon,
        highlight: false,
        type: 'url',
      },
    ]),
  siteUrl: window.location.origin,
  searchLinks: async (term?: string): Promise<SearchResult[]> => {
    if (!term) {
      return [
        {
          label: 'Latest posts',
          items: [
            {
              title: "Remote Work's Impact on Job Markets and Employment",
              url: 'https://source.inkling.local/remote-works-impact-on-job-markets/',
              metaText: '8 May 2024',
              MetaIcon: LockIcon,
              metaIconTitle: 'Members only',
            },
            {
              title: 'Robotics Renaissance: How Automation is Transforming Industries',
              url: 'https://source-newsletter.inkling.local/mental-health-awareness-in-the-workplace/',
              metaText: '2 May 2024',
              MetaIcon: DollarIcon,
              metaIconTitle: 'Specific tiers only',
            },
            {
              title: 'Biodiversity Conservation in Fragile Ecosystems',
              url: 'https://source.inkling.local/biodiversity-conservation-in-fragile-ecosystems/',
              metaText: '26 June 2024',
              MetaIcon: DollarIcon,
              metaIconTitle: 'Paid-members only',
            },
            {
              title: 'Unveiling the Crisis of Plastic Pollution: Analyzing Its Profound Impact on the Environment',
              url: 'https://source.inkling.local/plastic-pollution-crisis-deepens/',
              metaText: '16 Aug 2023',
            },
          ],
        },
      ]
    }

    const query = term.toLowerCase()

    return new Promise((resolve) => {
      setTimeout(
        () => {
          const posts = [
            {
              title: 'TK Reminders',
              url: 'https://inkling.local/changelog/tk-reminders/',
            },
            {
              title: '✨ Emoji autocomplete ✨',
              url: 'https://inkling.local/changelog/emoji-picker/',
            },
          ].filter((item) => item.title.toLowerCase().includes(query))

          const pages = [
            {
              title: 'How to update Inkling',
              url: 'https://inkling.local/docs/update/',
            },
          ].filter((item) => item.title.toLowerCase().includes(query))

          const tags = [
            {
              title: 'Improved',
              url: 'https://inkling.local/changelog/tag/improved/',
            },
          ].filter((item) => item.title.toLowerCase().includes(query))

          const groups: SearchResult[] = []

          if (posts.length) {
            groups.push({ label: 'Posts', items: posts })
          }
          if (pages.length) {
            groups.push({ label: 'Pages', items: pages })
          }
          if (tags.length) {
            groups.push({ label: 'Tags', items: tags })
          }

          resolve(groups)
        },
        process.env.NODE_ENV === 'test' ? 25 : 250,
      )
    })
  },
}

function getDefaultContent({ editorType }: { editorType?: string }) {
  if (editorType === 'basic') {
    return basicContent
  } else if (editorType === 'minimal') {
    return minimalContent
  }
  return content
}

function getAllowedNodes({ editorType }: { editorType?: string }) {
  if (editorType === 'basic') {
    return BASIC_NODES
  } else if (editorType === 'minimal') {
    return MINIMAL_NODES
  }
  // The full surface adds the demo host card to DEFAULT_NODES rather than forking the built-in set.
  return [...DEFAULT_NODES, musicPlayer.node]
}

interface DemoEditorProps {
  editorType?: string
  registerAPI: (api: ExternalControlAPI | null) => void
  cursorDidExitAtTop: () => void
  setWordCount: (count: number) => void
  setSelectionWordCount: (count: number | null) => void
  setTKCount: (count: number) => void
}

function DemoEditor({
  editorType,
  registerAPI,
  cursorDidExitAtTop,
  setWordCount,
  setSelectionWordCount,
  setTKCount,
}: DemoEditorProps) {
  if (editorType === 'basic') {
    return (
      <InklingComposableEditor
        cursorDidExitAtTop={cursorDidExitAtTop}
        markdownTransformers={BASIC_TRANSFORMERS}
        registerAPI={registerAPI}
      >
        <WordCountPlugin onChange={setWordCount} onSelectionChange={setSelectionWordCount} />
      </InklingComposableEditor>
    )
  } else if (editorType === 'minimal') {
    return (
      <InklingComposableEditor
        cursorDidExitAtTop={cursorDidExitAtTop}
        isSnippetsEnabled={false}
        markdownTransformers={MINIMAL_TRANSFORMERS}
        registerAPI={registerAPI}
      >
        <RestrictContentPlugin paragraphs={1} />
        <WordCountPlugin onChange={setWordCount} onSelectionChange={setSelectionWordCount} />
      </InklingComposableEditor>
    )
  }

  return (
    <InklingEditor cursorDidExitAtTop={cursorDidExitAtTop} registerAPI={registerAPI}>
      <WordCountPlugin onChange={setWordCount} onSelectionChange={setSelectionWordCount} />
      <TKCountPlugin onChange={setTKCount} />
    </InklingEditor>
  )
}

interface DemoComposerProps {
  editorType?: string
  isMultiplayer?: boolean
  setWordCount: (count: number) => void
  setSelectionWordCount: (count: number | null) => void
  setTKCount: (count: number) => void
}

function DemoComposer({
  editorType,
  isMultiplayer,
  setWordCount,
  setSelectionWordCount,
  setTKCount,
}: DemoComposerProps) {
  const [searchParams, setSearchParams] = useSearchParams()
  const sidebar = useDemoSidebar()
  const { snippets, createSnippet, deleteSnippet } = useSnippets()

  const darkMode = searchParams.get('darkMode') === 'true'
  const contentParam = searchParams.get('content')
  const labels = searchParams.get('labels') === 'zh' ? ZH_LABELS : undefined

  const defaultContent = React.useMemo(() => {
    return JSON.stringify(getDefaultContent({ editorType }))
  }, [editorType])

  const initialContent = React.useMemo(() => {
    if (isMultiplayer) {
      return null
    }

    if (contentParam === 'false') {
      return undefined
    }

    return contentParam ? decodeURIComponent(contentParam) : defaultContent
  }, [isMultiplayer, contentParam, defaultContent])

  const [title, setTitle] = useState(initialContent ? 'Meet the Inkling editor.' : '')
  const [editorAPI, setEditorAPI] = useState<ExternalControlAPI | null>(null)
  const titleRef = React.useRef<{ focus: () => void } | null>(null)
  const containerRef = React.useRef<HTMLDivElement>(null)

  const handleRegisterAPI = React.useCallback((api: ExternalControlAPI | null) => {
    setEditorAPI(api)
  }, [])

  function focusTitle() {
    titleRef.current?.focus()
  }

  function toggleDarkMode() {
    if (darkMode) {
      searchParams.delete('darkMode')
    } else {
      searchParams.set('darkMode', 'true')
    }
    setSearchParams(searchParams)
  }

  function saveContent() {
    if (!editorAPI) {
      return
    }
    const serializedState = editorAPI.serialize()
    const encodedContent = encodeURIComponent(serializedState)
    searchParams.set('content', encodedContent)
    setSearchParams(searchParams)
  }

  React.useEffect(() => {
    const handleFileDrag = (event: DragEvent) => {
      event.preventDefault()
    }

    const handleFileDrop = (event: DragEvent) => {
      if (event.dataTransfer && event.dataTransfer.files.length > 0 && editorAPI) {
        event.preventDefault()
        editorAPI.insertFiles(Array.from(event.dataTransfer.files))
      }
    }

    window.addEventListener('dragover', handleFileDrag)
    window.addEventListener('drop', handleFileDrop)

    return () => {
      window.removeEventListener('dragover', handleFileDrag)
      window.removeEventListener('drop', handleFileDrop)
    }
  }, [editorAPI])

  const showTitle = !isMultiplayer && !['basic', 'minimal'].includes(editorType || '')

  const cardConfig: CardConfig = {
    ...defaultCardConfig,
    snippets,
    createSnippet,
    deleteSnippet,
    searchLinks: searchParams.get('searchLinks') === 'false' ? undefined : defaultCardConfig.searchLinks,
    renderMath: searchParams.get('renderMath') === 'stub' ? stubRenderMath : undefined,
    // e2e seam: `?imageLibrary=fixture[-upload]` installs the fixture adapter (demo/utils/imageLibrary.ts);
    // absent = no library menu entry
    imageLibrary: getDemoImageLibrary(searchParams.get('imageLibrary')),
    // Pintura is a runtime CDN import — point the demo at a licensed build with VITE_PINTURA_JS_URL /
    // VITE_PINTURA_CSS_URL to test image editing.
    pinturaConfig: {
      jsUrl: import.meta.env.VITE_PINTURA_JS_URL || undefined,
      cssUrl: import.meta.env.VITE_PINTURA_CSS_URL || undefined,
    },
  }

  const fileUploader: FileUploader = { useFileUpload: useFileUpload({ isMultiplayer }), fileTypes }

  const { onMouseDown, onClick } = useFocusBelowCanvas({ editorAPI, containerRef })

  const demoChrome = <DemoChrome editorType={editorType || 'full'} saveContent={saveContent} sidebar={sidebar} />

  const demoLayout = (children: React.ReactNode) => (
    <div
      className={`inkling-demo relative h-full grow ${darkMode ? 'dark' : ''}`}
      style={sidebar.isSidebarOpen ? { '--inkling-breakout-adjustment': '440px' } : {}}
    >
      {!isMultiplayer && contentParam !== 'false' ? (
        <InitialContentToggle
          defaultContent={defaultContent}
          searchParams={searchParams}
          setSearchParams={setSearchParams}
          setTitle={setTitle}
        />
      ) : null}
      <DarkModeToggle darkMode={darkMode} toggleDarkMode={toggleDarkMode} />
      <FeatureChecklist />
      <div
        ref={containerRef}
        className="h-full overflow-auto overflow-x-hidden"
        onClick={onClick}
        onMouseDown={onMouseDown}
      >
        <div className="mx-auto max-w-[740px] px-6 py-[15vmin] lg:px-0">
          {showTitle ? <TitleTextBox ref={titleRef} editorAPI={editorAPI} setTitle={setTitle} title={title} /> : null}
          {children}
        </div>
      </div>
    </div>
  )

  return (
    <InklingComposer
      cardConfig={cardConfig}
      darkMode={darkMode}
      enableMultiplayer={isMultiplayer}
      fileUploader={fileUploader}
      initialEditorState={initialContent}
      isTKEnabled={true}
      labels={labels}
      multiplayerDocId={`demo/${WEBSOCKET_ID}`}
      multiplayerEndpoint={WEBSOCKET_ENDPOINT}
      nodes={getAllowedNodes({ editorType })}
    >
      {demoLayout(
        <DemoEditor
          cursorDidExitAtTop={focusTitle}
          editorType={editorType}
          registerAPI={handleRegisterAPI}
          setSelectionWordCount={setSelectionWordCount}
          setTKCount={setTKCount}
          setWordCount={setWordCount}
        />,
      )}
      {demoChrome}
    </InklingComposer>
  )
}

const MemoizedDemoComposer = React.memo(DemoComposer)

interface DemoAppProps {
  editorType?: string
  isMultiplayer?: boolean
}

function DemoApp({ editorType, isMultiplayer }: DemoAppProps) {
  const [wordCount, setWordCount] = useState(0)
  const [selectionWordCount, setSelectionWordCount] = useState<number | null>(null)
  const [tkCount, setTKCount] = useState(0)

  const location = useLocation()

  return (
    <div key={location.key} className={`inkling-lexical top`}>
      <WordCount selectionWordCount={selectionWordCount} tkCount={tkCount} wordCount={wordCount} />

      <MemoizedDemoComposer
        editorType={editorType}
        isMultiplayer={isMultiplayer}
        setSelectionWordCount={setSelectionWordCount}
        setTKCount={setTKCount}
        setWordCount={setWordCount}
      />
    </div>
  )
}

export default DemoApp
