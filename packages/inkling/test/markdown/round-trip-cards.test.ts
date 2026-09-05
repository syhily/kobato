import type { LexicalNode } from 'lexical'

import { describe, expect, it } from 'vitest'

import type { SerializedAudioNode } from '@/nodes/AudioNode'
import type { SerializedMarkdownNode } from '@/nodes/base/nodes/markdown/MarkdownNode'
import type { SerializedBookmarkNode } from '@/nodes/BookmarkNode'
import type { SerializedButtonNode } from '@/nodes/ButtonNode'
import type { SerializedCalloutNode } from '@/nodes/CalloutNode'
import type { SerializedFileNode } from '@/nodes/FileNode'
import type { SerializedGalleryNode } from '@/nodes/GalleryNode'
import type { SerializedHtmlNode } from '@/nodes/HtmlNode'
import type { SerializedImageNode } from '@/nodes/ImageNode'
import type { SerializedToggleNode } from '@/nodes/ToggleNode'
import type { SerializedVideoNode } from '@/nodes/VideoNode'

import { lexicalStateToMarkdown, markdownToLexicalState } from '@/markdown/round-trip'
import { generateDecoratorNode } from '@/nodes/base/generate-decorator-node'
import { defineCard, type HostCard } from '@/nodes/cards/host-cards'

function inklingCard(card: string, data: Record<string, unknown>) {
  return '```inkling:' + card + '\n' + JSON.stringify(data) + '\n```'
}

describe('Markdown round-trip for decorator cards', function () {
  it('round-trips an image card', function () {
    const markdown = '![A mountain](https://example.com/mountain.jpg)'
    const state = markdownToLexicalState(markdown)

    const root = state.root
    expect(root.children).toHaveLength(1)

    const imageNode = root.children[0] as SerializedImageNode
    expect(imageNode.type).toBe('image')
    expect(imageNode.src).toBe('https://example.com/mountain.jpg')
    expect(imageNode.alt).toBe('A mountain')

    const exported = lexicalStateToMarkdown(state)
    expect(exported.trim()).toBe(markdown)
  })

  it('round-trips an html card', function () {
    const markdown = inklingCard('html', { html: '<iframe src="https://example.com"></iframe>' })
    const state = markdownToLexicalState(markdown)

    const node = state.root.children[0] as SerializedHtmlNode
    expect(node.type).toBe('html')
    expect(node.html).toBe('<iframe src="https://example.com"></iframe>')

    const exported = lexicalStateToMarkdown(state)
    expect(exported.trim()).toBe(markdown)
  })

  it('round-trips a file card', function () {
    const markdown = inklingCard('file', {
      src: 'https://example.com/report.pdf',
      fileName: 'report.pdf',
      fileCaption: 'Q3 report',
    })
    const state = markdownToLexicalState(markdown)

    const node = state.root.children[0] as SerializedFileNode
    expect(node.type).toBe('file')
    expect(node.src).toBe('https://example.com/report.pdf')
    expect(node.fileName).toBe('report.pdf')
    expect(node.fileCaption).toBe('Q3 report')

    const exported = lexicalStateToMarkdown(state)
    expect(exported.trim()).toBe(markdown)
  })

  it('round-trips a button card', function () {
    const markdown = inklingCard('button', {
      buttonUrl: 'https://example.com',
      buttonText: 'Click me',
    })
    const state = markdownToLexicalState(markdown)

    const node = state.root.children[0] as SerializedButtonNode
    expect(node.type).toBe('button')
    expect(node.buttonUrl).toBe('https://example.com')
    expect(node.buttonText).toBe('Click me')

    const exported = lexicalStateToMarkdown(state)
    expect(exported.trim()).toBe(markdown)
  })

  it('round-trips an audio card', function () {
    const markdown = inklingCard('audio', {
      src: 'https://example.com/audio.mp3',
      caption: 'Podcast episode',
    })
    const state = markdownToLexicalState(markdown)

    const node = state.root.children[0] as SerializedAudioNode
    expect(node.type).toBe('audio')
    expect(node.src).toBe('https://example.com/audio.mp3')
    expect(node.title).toBe('Podcast episode')

    const exported = lexicalStateToMarkdown(state)
    expect(exported.trim()).toBe(markdown)
  })

  it('round-trips a video card', function () {
    const markdown = inklingCard('video', {
      src: 'https://example.com/video.mp4',
      caption: 'Demo video',
      thumbnailSrc: 'https://example.com/thumb.jpg',
    })
    const state = markdownToLexicalState(markdown)

    const node = state.root.children[0] as SerializedVideoNode
    expect(node.type).toBe('video')
    expect(node.src).toBe('https://example.com/video.mp4')
    expect(node.caption).toContain('Demo video')
    expect(node.thumbnailSrc).toBe('https://example.com/thumb.jpg')

    const exported = lexicalStateToMarkdown(state)
    expect(exported.trim()).toBe(markdown)
  })

  it('round-trips a gallery card', function () {
    const markdown = inklingCard('gallery', {
      images: [{ src: 'https://example.com/a.jpg' }, { src: 'https://example.com/b.jpg' }],
      caption: 'Two photos',
    })
    const state = markdownToLexicalState(markdown)

    const node = state.root.children[0] as SerializedGalleryNode
    expect(node.type).toBe('gallery')
    expect(node.images).toHaveLength(2)
    expect(node.images[0].src).toBe('https://example.com/a.jpg')
    expect(node.images[1].src).toBe('https://example.com/b.jpg')
    expect(node.caption).toContain('Two photos')

    const exported = lexicalStateToMarkdown(state)
    expect(exported.trim()).toBe(markdown)
  })

  it('round-trips a bookmark card', function () {
    const markdown = inklingCard('bookmark', {
      url: 'https://example.com',
      title: 'Example',
      description: 'An example site',
    })
    const state = markdownToLexicalState(markdown)

    const node = state.root.children[0] as SerializedBookmarkNode
    expect(node.type).toBe('bookmark')
    expect(node.url).toBe('https://example.com')
    expect(node.metadata.title).toBe('Example')
    expect(node.metadata.description).toBe('An example site')

    const exported = lexicalStateToMarkdown(state)
    expect(exported.trim()).toBe(markdown)
  })

  it('round-trips a toggle card', function () {
    const markdown = inklingCard('toggle', {
      heading: 'Summary',
      content: 'Hidden details',
    })
    const state = markdownToLexicalState(markdown)

    const node = state.root.children[0] as SerializedToggleNode
    expect(node.type).toBe('toggle')
    expect(node.heading).toContain('Summary')
    expect(node.content).toContain('Hidden details')

    const exported = lexicalStateToMarkdown(state)
    expect(exported.trim()).toBe(markdown)
  })

  it('round-trips a callout card', function () {
    const markdown = inklingCard('callout', {
      text: 'Important note',
      backgroundColor: 'green',
    })
    const state = markdownToLexicalState(markdown)

    const node = state.root.children[0] as SerializedCalloutNode
    expect(node.type).toBe('callout')
    expect(node.calloutText).toContain('Important note')
    expect(node.backgroundColor).toBe('green')

    const exported = lexicalStateToMarkdown(state)
    expect(exported.trim()).toBe(markdown)
  })

  it('round-trips a markdown card', function () {
    const markdown = '```inkling:markdown\n# Inner heading\n\nSome **bold** text\n```'
    const state = markdownToLexicalState(markdown)

    const node = state.root.children[0] as SerializedMarkdownNode
    expect(node.type).toBe('markdown')
    expect(node.markdown).toBe('# Inner heading\n\nSome **bold** text')

    const exported = lexicalStateToMarkdown(state)
    expect(exported.trim()).toBe(markdown)
  })

  it('round-trips an empty markdown card', function () {
    const markdown = '```inkling:markdown\n\n```'
    const state = markdownToLexicalState(markdown)

    const node = state.root.children[0] as SerializedMarkdownNode
    expect(node.type).toBe('markdown')
    expect(node.markdown).toBe('')

    const exported = lexicalStateToMarkdown(state)
    expect(exported.trim()).toBe(markdown)
  })
})

describe('Markdown round-trip for host cards', function () {
  // A host card (CONTEXT.md: "host card") joins the round-trip through the
  // `cards` option: its node class registers on the conversion editor and its
  // fence transformer joins the card run.
  const musicPlayer: HostCard<'musicPlayer'> = defineCard({
    nodeType: 'musicPlayer',
    baseNode: generateDecoratorNode({
      nodeType: 'musicPlayer',
      properties: [{ name: 'src', default: '' }] as const,
    }),
    toolbarLabel: 'music-player',
    render: () => null,
    markdownFence: {
      getData: (node) => ({ src: (node as unknown as { src: string }).src }),
      // the closure resolves the assembled class lazily — defineCard has
      // returned by the time an import runs
      createNode: (data): LexicalNode => new musicPlayer.node({ src: data.src }),
    },
  })

  it('round-trips a host card fence through the cards option', function () {
    const markdown = inklingCard('musicPlayer', { src: 'https://example.com/song.mp3' })
    const state = markdownToLexicalState(markdown, { cards: [musicPlayer] })

    const node = state.root.children[0] as unknown as { type: string; src: string }
    expect(node.type).toBe('musicPlayer')
    expect(node.src).toBe('https://example.com/song.mp3')

    const exported = lexicalStateToMarkdown(state, { cards: [musicPlayer] })
    expect(exported.trim()).toBe(markdown)
  })

  it('does not speak the host fence without the cards option', function () {
    const markdown = inklingCard('musicPlayer', { src: 'https://example.com/song.mp3' })
    const state = markdownToLexicalState(markdown)

    const node = state.root.children[0] as unknown as { type: string }
    expect(node.type).not.toBe('musicPlayer')
  })
})

describe('Malformed card fence payloads', function () {
  // The fence body passes through JSON.parse unchecked for shape: only a
  // plain object can carry the card's fields. A scalar/null body must throw a
  // descriptive TypeError naming the card at the transformer boundary — the
  // same idiom as the per-field str() guards — not a bare "Cannot read
  // properties of null" from `data.<field>` inside createNode.

  it('throws a descriptive TypeError naming the card when the fence body is null', function () {
    const markdown = '```inkling:html\nnull\n```'
    expect(() => markdownToLexicalState(markdown)).toThrow(TypeError)
    expect(() => markdownToLexicalState(markdown)).toThrow(
      "card markdown transformer: expected 'html' fence body to be a JSON object, got null",
    )
  })

  it('throws a descriptive TypeError naming the card when the fence body is a number', function () {
    const markdown = '```inkling:html\n42\n```'
    expect(() => markdownToLexicalState(markdown)).toThrow(TypeError)
    expect(() => markdownToLexicalState(markdown)).toThrow(
      "card markdown transformer: expected 'html' fence body to be a JSON object, got number",
    )
  })

  it('throws a descriptive TypeError naming the card and field when the fence body is an array', function () {
    const markdown = '```inkling:html\n[]\n```'
    expect(() => markdownToLexicalState(markdown)).toThrow(TypeError)
    expect(() => markdownToLexicalState(markdown)).toThrow("card markdown transformer: expected 'html.html'")
  })

  it('still imports a valid JSON object fence body', function () {
    const state = markdownToLexicalState(inklingCard('html', { html: '<b>hi</b>' }))
    const node = state.root.children[0] as SerializedHtmlNode
    expect(node.type).toBe('html')
    expect(node.html).toBe('<b>hi</b>')
  })
})
