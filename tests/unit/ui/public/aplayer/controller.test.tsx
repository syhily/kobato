import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { PlaybackControls } from '@/ui/public/aplayer/controller'

describe('ui/public/aplayer/controller', () => {
  it('renders controller structure with progress bar and time', () => {
    const html = renderToStaticMarkup(
      <PlaybackControls
        themeColor="#008c95"
        volume={0.5}
        onChangeVolume={() => undefined}
        muted={false}
        currentTime={65}
        audioDurationSeconds={180}
        bufferedSeconds={90}
        onToggleMuted={() => undefined}
      />,
    )
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
      <PlaybackControls
        themeColor="#008c95"
        volume={0.5}
        onChangeVolume={() => undefined}
        muted={false}
        currentTime={0}
        audioDurationSeconds={100}
        bufferedSeconds={0}
        onToggleMuted={() => undefined}
        loop
      />,
    )
    expect(html).toContain('aplayer-icon-loop')
    expect(html).not.toContain('opacity-40')
  })

  it('renders loop button with inactive state', () => {
    const html = renderToStaticMarkup(
      <PlaybackControls
        themeColor="#008c95"
        volume={0.5}
        onChangeVolume={() => undefined}
        muted={false}
        currentTime={0}
        audioDurationSeconds={100}
        bufferedSeconds={0}
        onToggleMuted={() => undefined}
        loop={false}
      />,
    )
    expect(html).toContain('aplayer-icon-loop')
    expect(html).toContain('opacity-40')
  })

  it('renders volume control', () => {
    const html = renderToStaticMarkup(
      <PlaybackControls
        themeColor="#008c95"
        volume={0.5}
        onChangeVolume={() => undefined}
        muted={false}
        currentTime={0}
        audioDurationSeconds={100}
        bufferedSeconds={0}
        onToggleMuted={() => undefined}
      />,
    )
    expect(html).toContain('aplayer-volume-wrap')
  })
})
