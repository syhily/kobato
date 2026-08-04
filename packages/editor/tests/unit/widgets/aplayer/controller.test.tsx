import type { AudioControl } from '@kobato/editor/widgets/aplayer/hooks/use-audio-control'

import { PlaybackControls } from '@kobato/editor/widgets/aplayer/controller'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

function makeControl(overrides: Partial<AudioControl> = {}): AudioControl {
  return {
    volume: 0.5,
    setVolume: () => undefined,
    muted: false,
    toggleMuted: () => undefined,
    isPlaying: false,
    duration: 180,
    currentTime: 65,
    bufferedSeconds: 90,
    playAudio: async () => undefined,
    togglePlay: () => undefined,
    seek: () => undefined,
    isLoading: false,
    loop: false,
    toggleLoop: () => undefined,
    ...overrides,
  }
}

describe('editor/widgets/aplayer/controller', () => {
  it('renders controller structure with progress bar and time', () => {
    const html = renderToStaticMarkup(<PlaybackControls themeColor="#008c95" control={makeControl()} />)
    expect(html).toContain('aplayer-controller')
    expect(html).toContain('aplayer-bar-wrap')
    expect(html).toContain('aplayer-time')
    expect(html).toContain('aplayer-ptime')
    expect(html).toContain('aplayer-dtime')
    expect(html).toContain('01:05')
    expect(html).toContain('03:00')
  })

  it('renders loop button with active state', () => {
    const html = renderToStaticMarkup(
      <PlaybackControls themeColor="#008c95" control={makeControl({ currentTime: 0, duration: 100, loop: true })} />,
    )
    expect(html).toContain('aplayer-icon-loop')
    expect(html).not.toContain('opacity-40')
  })

  it('renders loop button with inactive state', () => {
    const html = renderToStaticMarkup(
      <PlaybackControls themeColor="#008c95" control={makeControl({ currentTime: 0, duration: 100 })} />,
    )
    expect(html).toContain('aplayer-icon-loop')
    expect(html).toContain('opacity-40')
  })

  it('renders volume control', () => {
    const html = renderToStaticMarkup(
      <PlaybackControls themeColor="#008c95" control={makeControl({ currentTime: 0, duration: 100 })} />,
    )
    expect(html).toContain('aplayer-volume-wrap')
  })
})
