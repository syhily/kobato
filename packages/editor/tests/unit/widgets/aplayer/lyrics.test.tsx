import { Lyrics, parseLrc } from '@kobato/editor/widgets/aplayer/lyrics'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

describe('editor/widgets/aplayer/lyrics', () => {
  describe('parseLrc', () => {
    it('returns empty array for undefined input', () => {
      expect(parseLrc(undefined)).toEqual([])
    })

    it('returns empty array for empty string', () => {
      expect(parseLrc('')).toEqual([])
    })

    it('parses a single line with one timestamp', () => {
      const input = '[00:12.34]Hello world'
      expect(parseLrc(input)).toEqual([[12.34, 'Hello world']])
    })

    it('parses multiple timestamps on the same line', () => {
      const input = '[00:01.00][00:02.00]Repeated text'
      expect(parseLrc(input)).toEqual([
        [1.0, 'Repeated text'],
        [2.0, 'Repeated text'],
      ])
    })

    it('ignores inline time tags', () => {
      const input = '[00:10.00]Line with <00:10.50>inline<00:11.00> tags'
      expect(parseLrc(input)).toEqual([[10.0, 'Line with inline tags']])
    })

    it('sorts lines by timestamp', () => {
      const input = '[00:30.00]Third\n[00:10.00]First\n[00:20.00]Second'
      const result = parseLrc(input)
      expect(result.map((r) => r[0])).toEqual([10.0, 20.0, 30.0])
    })

    it('handles two-digit milliseconds', () => {
      const input = '[01:23.45]Two digit ms'
      expect(parseLrc(input)).toEqual([[83.45, 'Two digit ms']])
    })

    it('handles three-digit milliseconds', () => {
      const input = '[01:23.456]Three digit ms'
      expect(parseLrc(input)).toEqual([[83.456, 'Three digit ms']])
    })

    it('handles no-millisecond timestamp', () => {
      const input = '[02:30]No ms'
      expect(parseLrc(input)).toEqual([[150.0, 'No ms']])
    })

    it('ignores malformed lines', () => {
      const input = 'not a lyric line\n[00:10.00]Valid line\n[bad]Also bad'
      expect(parseLrc(input)).toEqual([[10.0, 'Valid line']])
    })

    it('trims whitespace from text', () => {
      const input = '[00:10.00]  spaced out  '
      expect(parseLrc(input)).toEqual([[10.0, 'spaced out']])
    })

    it('fixes missing newline before timestamp', () => {
      const input = 'some text[00:10.00]lyric'
      expect(parseLrc(input)).toEqual([[10.0, 'lyric']])
    })
  })

  describe('Lyrics component', () => {
    it('renders hidden when show is false', () => {
      const html = renderToStaticMarkup(<Lyrics show={false} lrcText="[00:10.00]Test" currentTime={0} />)
      expect(html).toContain('aplayer-lrc')
      expect(html.includes('hidden')).toBe(true)
    })

    it('renders lyrics lines when show is true', () => {
      const html = renderToStaticMarkup(<Lyrics show lrcText="[00:10.00]First\n[00:20.00]Second" currentTime={15} />)
      expect(html).toContain('First')
      expect(html).toContain('Second')
      expect(html).toContain('aplayer-lrc-current')
    })

    it('renders nothing when lrcText is undefined', () => {
      const html = renderToStaticMarkup(<Lyrics show currentTime={0} />)
      expect(html).not.toContain('aplayer-lrc-contents')
    })

    it('highlights the correct line based on currentTime', () => {
      const html = renderToStaticMarkup(
        <Lyrics show lrcText="[00:10.00]A\n[00:20.00]B\n[00:30.00]C" currentTime={25} />,
      )
      const lines = html.split('<p')
      const currentLine = lines.find((l) => l.includes('aplayer-lrc-current'))
      expect(currentLine).toContain('B')
    })
  })
})
