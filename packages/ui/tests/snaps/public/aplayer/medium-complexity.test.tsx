import type { AudioControl } from '@kobato/ui/public/aplayer/hooks/use-audio-control'

import { renderToHtml } from '#/_helpers/render'

import { PlaybackControls } from '@kobato/ui/public/aplayer/controller'
import { Lyrics, parseLrc } from '@kobato/ui/public/aplayer/lyrics'
import { APlayer } from '@kobato/ui/public/aplayer/player'
import { ProgressBar } from '@kobato/ui/public/aplayer/progress'
import { Volume } from '@kobato/ui/public/aplayer/volume'
import { describe, expect, it } from 'vitest'

const audio = {
  name: 'Test Song',
  artist: 'Test Artist',
  url: 'https://example.com/audio.mp3',
  cover: 'https://example.com/cover.png',
  lrc: '[00:00.00]Line one\n[00:05.00]Line two',
}

const playbackControl: AudioControl = {
  volume: 0.7,
  setVolume: () => undefined,
  muted: false,
  toggleMuted: () => undefined,
  isPlaying: false,
  duration: 120,
  currentTime: 12,
  bufferedSeconds: 30,
  playAudio: async () => undefined,
  togglePlay: () => undefined,
  seek: () => undefined,
  isLoading: false,
  loop: true,
  toggleLoop: () => undefined,
}

describe('snapshot: medium-complexity aplayer components', () => {
  it('APlayer renders the normal layout with cover, info and controls', () => {
    const html = renderToHtml(<APlayer audio={audio} />)
    expect(html).toContain('aplayer')
    expect(html).toContain('Test Song')
    expect(html).toContain('Test Artist')
    expect(html).toContain('https://example.com/cover.png')
    expect(html).toContain('aplayer-controller')
  })

  it('APlayer renders the fixed appearance without embedded lyrics', () => {
    const html = renderToHtml(<APlayer audio={audio} appearance="fixed" />)
    expect(html).toContain('aplayer-fixed')
    expect(html).toContain('Test Song')
  })

  it('PlaybackControls renders time, volume and loop button', () => {
    const html = renderToHtml(<PlaybackControls themeColor="#ebd0c2" control={playbackControl} />)
    expect(html).toContain('aplayer-controller')
    expect(html).toContain('aplayer-time')
    expect(html).toContain('0:12')
    expect(html).toContain('2:00')
    expect(html).toContain('aplayer-icon-loop')
  })

  it('ProgressBar renders played and buffered bars', () => {
    const html = renderToHtml(
      <ProgressBar themeColor="#ebd0c2" playedPercentage={0.25} bufferedPercentage={0.5} onSeek={() => undefined} />,
    )
    expect(html).toContain('aplayer-bar-wrap')
    expect(html).toContain('aplayer-played')
    expect(html).toContain('aplayer-loaded')
    expect(html).toContain('width:25%')
    expect(html).toContain('width:50%')
  })

  it('Volume renders the volume icon and bar', () => {
    const html = renderToHtml(
      <Volume
        themeColor="#ebd0c2"
        volume={0.5}
        muted={false}
        onToggleMuted={() => undefined}
        onChangeVolume={() => undefined}
      />,
    )
    expect(html).toContain('aplayer-volume-wrap')
    expect(html).toContain('aplayer-volume-bar-wrap')
    expect(html).toContain('height:50%')
  })

  it('Lyrics renders parsed lines and current-line highlighting', () => {
    const html = renderToHtml(<Lyrics show lrcText={audio.lrc} currentTime={3} />)
    expect(html).toContain('aplayer-lrc')
    expect(html).toContain('Line one')
    expect(html).toContain('Line two')
  })

  it('parseLrc sorts and strips time tags', () => {
    const lines = parseLrc('[00:05.00]Second\n[00:01.00]First')
    expect(lines).toEqual([
      [1, 'First'],
      [5, 'Second'],
    ])
  })
})
