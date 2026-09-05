import type { Meta, StoryObj } from '@storybook/react'

import React from 'react'

import type { GifBrowser, GifFetchOutcome, GifFetchPage } from '@/utils/services/gif-browser'

import GifSelector from '@/components/ui/GifSelector'
import { useGifBrowser } from '@/hooks/useGifBrowser'
import { getGifProviderConfig, type GifData, type GifProviderConfig } from '@/utils/services/gif'

import { tenorConfig } from '../../../demo/utils/gifConfig'

const meta = {
  title: 'File Selectors/Gif',
  component: GifSelector,
  parameters: {
    status: {
      type: 'Functional',
    },
  },
} satisfies Meta<typeof GifSelector>
export default meta

type Story = StoryObj<Meta>

function storyGif(id: string, dims: [number, number]): GifData {
  return {
    id,
    content_description: `Story gif ${id}`,
    media_formats: {
      tinygif: { url: '/inkling-editor-1.png', dims },
      gif: { url: '/inkling-editor-1.png', dims },
    },
  }
}

const storyGifs: GifData[] = [
  storyGif('story-1', [460, 240]),
  storyGif('story-2', [460, 300]),
  storyGif('story-3', [460, 200]),
  storyGif('story-4', [460, 260]),
  storyGif('story-5', [460, 220]),
  storyGif('story-6', [460, 280]),
]

// Scripted stories drive a real browser through a stubbed fetchPage port, so
// every state below is a state the module can actually reach.
const SCRIPTED_CONFIG: GifProviderConfig = {
  provider: 'tenor',
  apiUrl: 'https://tenor.googleapis.com',
  apiKey: 'storybook',
  contentFilter: 'off',
}

interface ScriptedStoryProps {
  fetchPage: GifFetchPage
  drive?: (browser: GifBrowser) => void | (() => void)
}

function ScriptedGifSelector({ fetchPage, drive }: ScriptedStoryProps) {
  const browser = useGifBrowser({ config: SCRIPTED_CONFIG, fetchPage })

  React.useEffect(() => {
    return drive?.(browser)
  }, [browser, drive])

  return <GifSelector browser={browser} provider="tenor" onGifInsert={() => {}} onClickOutside={() => {}} />
}

function LiveGifSelector({ config }: { config: GifProviderConfig }) {
  const browser = useGifBrowser({ config })

  return <GifSelector browser={browser} provider={config.provider} onGifInsert={() => {}} onClickOutside={() => {}} />
}

export const Base: Story = {
  render: () => {
    // live Tenor data when the demo has an API key, scripted fixtures otherwise
    const config = getGifProviderConfig({ tenor: tenorConfig ?? undefined })
    if (config) {
      return <LiveGifSelector config={config} />
    }
    return <ScriptedGifSelector fetchPage={() => Promise.resolve({ ok: true, results: storyGifs, next: null })} />
  },
}

export const Loading: Story = {
  render: () => <ScriptedGifSelector fetchPage={() => new Promise<GifFetchOutcome>(() => {})} />,
}

export const LazyLoading: Story = {
  render: () => (
    <ScriptedGifSelector
      fetchPage={(url) => {
        // the first page resolves; the lazy next page never settles
        if (url.includes('pos=')) {
          return new Promise<GifFetchOutcome>(() => {})
        }
        return Promise.resolve({ ok: true as const, results: storyGifs, next: 'page-2' })
      }}
      drive={(browser) => {
        const unsubscribe = browser.subscribe(() => {
          const snapshot = browser.getSnapshot()
          if (snapshot.gifs.length > 0 && !snapshot.isLoading) {
            unsubscribe()
            browser.dispatch({ type: 'load-more' })
          }
        })
        return unsubscribe
      }}
    />
  ),
}

export const ErrorCommon: Story = {
  render: () => <ScriptedGifSelector fetchPage={() => Promise.resolve({ ok: false, message: 'fetch failed' })} />,
}

export const ErrorInvalidKey: Story = {
  render: () => <ScriptedGifSelector fetchPage={() => Promise.resolve({ ok: false, message: 'API key not valid' })} />,
}
