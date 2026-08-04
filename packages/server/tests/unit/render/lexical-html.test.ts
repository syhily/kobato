import type { MusicEmbedResolver } from '@kobato/server/domains/lexical/embeds'
import type { LexicalBody } from '@kobato/shared/lexical/schema'

import { renderLexicalBodyToHtml } from '@kobato/server/render/lexical-html'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// The server-side assembly seam: `renderLexicalBodyToHtml` must forward
// heading slugs, mode, music metadata (absolutized covers), and the
// settings-driven footnotes title into the editor-package string
// renderer. The byte-exact output contract itself lives in
// `apps/public/tests/unit/render/lexical-html-manifest.test.ts`.

const resolveMusicEmbeds = vi.fn<MusicEmbedResolver>()

function fixtureBody(): LexicalBody {
  return {
    root: {
      direction: null,
      format: '',
      indent: 0,
      version: 1,
      type: 'root',
      children: [
        {
          direction: null,
          format: '',
          indent: 0,
          version: 1,
          type: 'heading',
          tag: 'h1',
          children: [{ detail: 0, format: 0, mode: 'normal', style: '', text: 'Title', type: 'text', version: 1 }],
        },
        { type: 'musicPlayer', version: 1, playerId: 'p1' },
        {
          direction: null,
          format: '',
          indent: 0,
          version: 1,
          type: 'footnoteDefinition',
          index: 1,
          children: [
            {
              direction: null,
              format: '',
              indent: 0,
              version: 1,
              type: 'paragraph',
              children: [{ detail: 0, format: 0, mode: 'normal', style: '', text: 'Note', type: 'text', version: 1 }],
              textFormat: 0,
              textStyle: '',
            },
          ],
        },
      ],
    },
  }
}

describe('renderLexicalBodyToHtml', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resolveMusicEmbeds.mockResolvedValue(
      new Map([
        [
          'p1',
          {
            id: 'p1',
            name: 'Song',
            artist: 'Artist',
            album: 'Album',
            url: 'https://cdn.example.com/song.mp3',
            pic: '/images/default-music-cover.png',
            lyric: '',
          },
        ],
      ]),
    )
  })

  it('renders the default-mode contract with slugs, music, and the settings footnotes title', async () => {
    const html = await renderLexicalBodyToHtml(fixtureBody(), ['custom-title'], resolveMusicEmbeds)
    expect(resolveMusicEmbeds).toHaveBeenCalledWith(['p1'])
    expect(html).toBe(
      '<div class="portable-text-body">' +
        '<h1 id="custom-title" class="scroll-mt-20">Title</h1>' +
        '<div class="mt-5 mb-[1.375rem] max-w-[21.875rem] max-xl:mx-auto max-md:mt-0 max-md:mb-5 max-md:max-w-full mx-auto max-md:mx-auto">' +
        '<figure><img src="https://example.com/images/default-music-cover.png" alt="Song"/>' +
        '<audio controls preload="none" src="https://cdn.example.com/song.mp3"></audio>' +
        '<figcaption>🎵 Song — Artist</figcaption></figure></div>' +
        '<section class="footnotes" data-footnotes="" aria-labelledby="footnotes-section-heading">' +
        '<h3 id="footnotes-section-heading" class="mt-10 mb-3 scroll-mt-20 text-lg font-semibold text-ink-1">尾声礼记</h3>' +
        '<ol><li id="user-content-fn-1"><p>Note' +
        '<a href="#user-content-fnref-1" data-footnote-backref="" aria-label="返回引用" class="data-footnote-backref">↩</a>' +
        '</p></li></ol></section></div>',
    )
  })

  it('renders the rss-mode contract (classless, figure+audio, no body wrapper)', async () => {
    const html = await renderLexicalBodyToHtml(fixtureBody(), ['custom-title'], resolveMusicEmbeds, {
      rssMode: true,
    })
    expect(html).toBe(
      '<h1 id="custom-title">Title</h1>' +
        '<figure><img src="https://example.com/images/default-music-cover.png" alt="Song"/>' +
        '<audio controls preload="none" src="https://cdn.example.com/song.mp3"></audio>' +
        '<figcaption>🎵 Song — Artist</figcaption></figure>' +
        '<section data-footnotes="" aria-labelledby="footnotes-section-heading">' +
        '<h3 id="footnotes-section-heading">尾声礼记</h3>' +
        '<ol><li id="user-content-fn-1"><p>Note' +
        '<a href="#user-content-fnref-1" data-footnote-backref="" aria-label="返回引用">↩</a>' +
        '</p></li></ol></section>',
    )
  })

  it('skips music resolution when the body has no players', async () => {
    const body = fixtureBody()
    body.root.children = body.root.children.filter((child) => child.type !== 'musicPlayer')
    await renderLexicalBodyToHtml(body, [], resolveMusicEmbeds)
    expect(resolveMusicEmbeds).not.toHaveBeenCalled()
  })
})
