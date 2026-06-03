import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import type { AudioInfo } from '@/ui/public/aplayer/types'

import { APlayer } from '@/ui/public/aplayer/player'

const mockAudio: AudioInfo = {
  name: 'Test Song',
  artist: 'Test Artist',
  url: 'https://example.com/audio.mp3',
  cover: 'https://example.com/cover.jpg',
  lrc: '[00:10.00]First line',
}

const mockAudioWithArtistUrl: AudioInfo = {
  name: 'Test Song',
  artist: { name: 'Linked Artist', url: 'https://artist.example.com' },
  url: 'https://example.com/audio.mp3',
  cover: 'https://example.com/cover.jpg',
}

describe('ui/public/aplayer/player', () => {
  it('renders root with aplayer class and semantic structure', () => {
    const html = renderToStaticMarkup(<APlayer audio={mockAudio} />)
    expect(html).toContain('aplayer')
    expect(html).toContain('aplayer-body')
    expect(html).toContain('aplayer-pic')
    expect(html).toContain('aplayer-info')
    expect(html).toContain('aplayer-music')
    expect(html).toContain('Test Song')
    expect(html).toContain('Test Artist')
  })

  it('renders artist as plain text when string', () => {
    const html = renderToStaticMarkup(<APlayer audio={mockAudio} />)
    expect(html).toContain('Test Artist')
    expect(html).not.toContain('href=')
  })

  it('renders artist as link when object with url', () => {
    const html = renderToStaticMarkup(<APlayer audio={mockAudioWithArtistUrl} />)
    expect(html).toContain('Linked Artist')
    expect(html).toContain('href="https://artist.example.com"')
  })

  it('renders artist name without link when object lacks url', () => {
    const audio: AudioInfo = {
      name: 'Song',
      artist: { name: 'NoLink' },
      url: 'https://example.com/audio.mp3',
    }
    const html = renderToStaticMarkup(<APlayer audio={audio} />)
    expect(html).toContain('NoLink')
    expect(html).not.toContain('href=')
  })

  it('renders fallback artist text when undefined', () => {
    const audio: AudioInfo = { name: 'Song', url: 'https://example.com/audio.mp3' }
    const html = renderToStaticMarkup(<APlayer audio={audio} />)
    expect(html).toContain('Audio artist')
  })

  it('applies aplayer-withlrc when lrc is present', () => {
    const html = renderToStaticMarkup(<APlayer audio={mockAudio} />)
    expect(html).toContain('aplayer-withlrc')
  })

  it('does not apply aplayer-withlrc when lrc is absent', () => {
    const audio = { ...mockAudio, lrc: undefined }
    const html = renderToStaticMarkup(<APlayer audio={audio} />)
    expect(html).not.toContain('aplayer-withlrc')
  })

  it('renders cover image as background', () => {
    const html = renderToStaticMarkup(<APlayer audio={mockAudio} />)
    expect(html).toContain('https://example.com/cover.jpg')
  })

  it('renders notice element', () => {
    const html = renderToStaticMarkup(<APlayer audio={mockAudio} />)
    expect(html).toContain('aplayer-notice')
  })

  it('renders miniswitcher hidden', () => {
    const html = renderToStaticMarkup(<APlayer audio={mockAudio} />)
    expect(html).toContain('aplayer-miniswitcher')
    expect(html).toContain('hidden')
  })
})
