import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { LyricsPanel, parseLrc } from '@/ui/public/music-player/lyrics'

describe('ui/public/music-player/lyrics', () => {
  describe('parseLrc', () => {
    it('returns empty array for undefined input', () => {
      expect(parseLrc(undefined)).toEqual([])
    })

    it('returns empty array for empty string', () => {
      expect(parseLrc('')).toEqual([])
    })

    it('parses a single line with one timestamp', () => {
      expect(parseLrc('[00:12.34]Hello world')).toEqual([[12.34, 'Hello world']])
    })

    it('parses multiple timestamps on the same line', () => {
      expect(parseLrc('[00:01.00][00:02.00]Repeated text')).toEqual([
        [1.0, 'Repeated text'],
        [2.0, 'Repeated text'],
      ])
    })

    it('ignores inline time tags', () => {
      expect(parseLrc('[00:10.00]Line with <00:10.50>inline<00:11.00> tags')).toEqual([[10.0, 'Line with inline tags']])
    })

    it('sorts lines by timestamp', () => {
      const result = parseLrc('[00:30.00]Third\n[00:10.00]First\n[00:20.00]Second')
      expect(result.map((r) => r[0])).toEqual([10.0, 20.0, 30.0])
    })

    it('handles two-digit milliseconds', () => {
      expect(parseLrc('[01:23.45]Two digit ms')).toEqual([[83.45, 'Two digit ms']])
    })

    it('handles three-digit milliseconds', () => {
      expect(parseLrc('[01:23.456]Three digit ms')).toEqual([[83.456, 'Three digit ms']])
    })

    it('handles no-millisecond timestamp', () => {
      expect(parseLrc('[02:30]No ms')).toEqual([[150.0, 'No ms']])
    })

    it('ignores malformed lines', () => {
      expect(parseLrc('not a lyric line\n[00:10.00]Valid line\n[bad]Also bad')).toEqual([[10.0, 'Valid line']])
    })

    it('trims whitespace from text', () => {
      expect(parseLrc('[00:10.00]  spaced out  ')).toEqual([[10.0, 'spaced out']])
    })

    it('fixes missing newline before timestamp', () => {
      expect(parseLrc('some text[00:10.00]lyric')).toEqual([[10.0, 'lyric']])
    })
  })

  describe('LyricsPanel', () => {
    it('renders every line', () => {
      const html = renderToStaticMarkup(
        <LyricsPanel currentTime={0} lrc="[00:10.00]First\n[00:20.00]Second" onSeek={() => {}} />,
      )
      expect(html).toContain('First')
      expect(html).toContain('Second')
    })

    it('renders nothing when no line parses', () => {
      const html = renderToStaticMarkup(<LyricsPanel currentTime={0} lrc="no timestamps here" onSeek={() => {}} />)
      expect(html).toBe('')
    })

    it('highlights the line matching currentTime', () => {
      const html = renderToStaticMarkup(
        <LyricsPanel currentTime={25} lrc="[00:10.00]A\n[00:20.00]B\n[00:30.00]C" onSeek={() => {}} />,
      )
      const buttons = html.split('<button')
      const active = buttons.find((fragment) => fragment.includes('text-brand'))
      expect(active).toContain('B')
    })

    it('highlights nothing before the first timestamp', () => {
      const html = renderToStaticMarkup(<LyricsPanel currentTime={5} lrc="[00:10.00]A" onSeek={() => {}} />)
      expect(html).not.toContain('text-brand')
    })
  })
})
