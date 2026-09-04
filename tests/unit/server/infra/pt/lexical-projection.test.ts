import { describe, expect, it } from 'vitest'

import { lexicalBodyWith, lexicalHeading, lexicalImage, lexicalParagraph } from '#/_helpers/lexical'
import { computeBodyProjections } from '@/server/infra/pt/lexical-projection'
import { lexicalEditorStateSchema, type LexicalEditorState } from '@/shared/lexical/schema'

// The projections consume the canonicalized state (artifacts already filled
// by the prerender pass); fixtures here carry hand-filled sentinel artifacts
// so the render forms are pinned without a KaTeX/Shiki bootstrap. jsdom runs
// for real — the assertions pin inkling's actual exportDOM output, including
// the R10 host cards' real HTML (they register as projection node classes, so
// the R9b substitution path no longer fires for them).

function parse(state: unknown): LexicalEditorState {
  return lexicalEditorStateSchema.parse(state)
}

function textNode(text: string) {
  return { type: 'extended-text', version: 1, detail: 0, format: 0, mode: 'normal', style: '', text }
}

const MUSIC_PLAYER = {
  type: 'music-player',
  version: 1,
  playerId: 'p1',
  name: 'Song',
  artist: 'Artist',
  cover: '/storage/music/cover.png',
  audioUrl: '/storage/music/song.mp3',
  lyric: 'la-la',
}
const TWO_COLUMN = { type: 'two-column', version: 1, left: '<p>左栏</p>', right: '<p>右栏</p>' }
const SOLUTION = { type: 'solution', version: 1, content: '<p>答案 <strong>42</strong></p>' }

const RICH_STATE = parse(
  lexicalBodyWith([
    lexicalHeading('h2', '你好 世界'),
    lexicalParagraph('Hello <world> & 你好'),
    { type: 'math', version: 1, tex: 'E=mc^2', mathml: '<math><mi>E</mi></math>', svg: '' },
    {
      type: 'paragraph',
      version: 1,
      direction: 'ltr',
      format: '',
      indent: 0,
      children: [
        textNode('inline '),
        { type: 'math-inline', version: 1, tex: 'x^2', mathml: '<math><mi>x</mi></math>', svg: '' },
      ],
    },
    {
      type: 'codeblock',
      version: 1,
      code: 'const a = 1 < 2',
      language: 'typescript',
      caption: '',
      highlightedHtml: '<span class="line">const a = 1</span>',
    },
    lexicalImage(),
    MUSIC_PLAYER,
    TWO_COLUMN,
    SOLUTION,
    lexicalParagraph('after cards'),
  ]),
)

const FOOTNOTE_STATE = parse(
  lexicalBodyWith([
    {
      type: 'paragraph',
      version: 1,
      direction: 'ltr',
      format: '',
      indent: 0,
      children: [textNode('text'), { ...textNode('1'), type: 'footnote-ref', targetKey: 'fn-1' }],
    },
    { type: 'footnotedefinition', version: 1, content: '<p>note body</p>', targetKey: 'fn-1', index: 1 },
  ]),
)

describe('infra/pt/lexical-projection — full-fidelity HTML', () => {
  it('renders headings with ids, math/code artifacts, and images', async () => {
    const { bodyHtml } = await computeBodyProjections(RICH_STATE)

    // Heading ids come from inkling's export (slug parity contract-tested in
    // tests/unit/shared/contracts/lexical-heading-slug.test.ts).
    expect(bodyHtml).toContain('<h2 id="%E4%BD%A0%E5%A5%BD-%E4%B8%96%E7%95%8C">你好 世界</h2>')
    // Text is escaped.
    expect(bodyHtml).toContain('<p>Hello &lt;world&gt; &amp; 你好</p>')
    // Server-prerendered artifacts pass through (sanitized).
    expect(bodyHtml).toContain('<div class="inkling-card inkling-math-card"><math><mi>E</mi></math></div>')
    expect(bodyHtml).toContain('<span class="inkling-math-inline"><math><mi>x</mi></math></span>')
    expect(bodyHtml).toContain('<span class="line">const a = 1</span>')
    // KobatoImageNode (R11) exports the PT figure markup: layout classes on
    // the figure, the dim class + sizes on the img.
    expect(bodyHtml).toContain('<figure class="block max-w-full mx-auto w-fit">')
    expect(bodyHtml).toContain('<img src="/storage/posts/cover.png"')
    expect(bodyHtml).toContain('sizes="100vw"')
    expect(bodyHtml).toContain('<p>after cards</p>')
  })

  it('renders the kobato image extras (thumbhash, layout, caption)', async () => {
    const state = parse(
      lexicalBodyWith([
        lexicalImage({
          thumbhash: 'th-abcd',
          storagePath: 'objects/abcdef.png',
          imageId: 'img_1',
          layout: 'left',
          // The stored caption is the nested editor's first-child-inner HTML.
          caption: '题注 <strong>粗体</strong>',
        }),
      ]),
    )
    const { bodyHtml, bodyHtmlFeed } = await computeBodyProjections(state)

    expect(bodyHtml).toContain('<figure class="block max-w-full mr-auto ml-0 w-fit" data-layout="left">')
    expect(bodyHtml).toContain('data-thumbhash="th-abcd"')
    // storagePath/imageId never reach the public markup.
    expect(bodyHtml).not.toContain('objects/abcdef')
    expect(bodyHtml).not.toContain('img_1')
    // The caption keeps its (sanitized) inline markup, unlike the PT plain-text figcaption.
    expect(bodyHtml).toContain('<figcaption>题注 <strong>粗体</strong></figcaption>')
    // Feed variant: bare figure, absolutized src, plain-text caption (PT rssMode parity).
    expect(bodyHtmlFeed).toContain(
      '<figure><img src="https://example.com/storage/posts/cover.png" alt="cover" width="800" height="600"><figcaption>题注 粗体</figcaption></figure>',
    )
  })

  it('renders the R10 host cards as real HTML (no substitution)', async () => {
    const { bodyHtml } = await computeBodyProjections(RICH_STATE)

    // solution: the styled blockquote mirroring the public renderer.
    expect(bodyHtml).toContain('solution-begin')
    expect(bodyHtml).toContain('解：')
    expect(bodyHtml).toContain('<p>答案 <strong>42</strong></p>')
    expect(bodyHtml).toContain('solution-qed')
    // two-column: the responsive grid with both panes.
    expect(bodyHtml).toContain('data-pt-two-column=""')
    expect(bodyHtml).toContain('data-side="left"')
    expect(bodyHtml).toContain('<p>左栏</p>')
    expect(bodyHtml).toContain('<p>右栏</p>')
    // music-player: the aplayer mount point carries the meta snapshot for
    // hydration, plus the static fallback card.
    expect(bodyHtml).toContain('class="aplayer"')
    expect(bodyHtml).toContain('data-id="p1"')
    expect(bodyHtml).toContain('data-name="Song"')
    expect(bodyHtml).toContain('data-url="/storage/music/song.mp3"')
    expect(bodyHtml).toContain('data-music-player-fallback=""')
  })

  it('renders the footnotes section with the settings-owned title and PT anchor contract', async () => {
    const { bodyHtml } = await computeBodyProjections(FOOTNOTE_STATE)
    expect(bodyHtml).toContain('<h3 id="footnotes-section-heading">尾声礼记</h3>')
    expect(bodyHtml).toContain('href="#user-content-fn-1"')
    expect(bodyHtml).toContain('<li id="user-content-fn-1">')
    expect(bodyHtml).toContain('data-footnote-backref=""')
  })
})

describe('infra/pt/lexical-projection — feed variant (rssMode parity)', () => {
  it('degrades math to escaped TeX and code to a plain pre/code', async () => {
    const { bodyHtmlFeed } = await computeBodyProjections(RICH_STATE)

    // Block math: <pre><code>escaped tex</code></pre> (pt-html.ts:266-268).
    expect(bodyHtmlFeed).toContain('<pre><code>E=mc^2</code></pre>')
    expect(bodyHtmlFeed).not.toContain('inkling-math-card')
    // Inline math: escaped TeX code (pt-html.ts:151-155).
    expect(bodyHtmlFeed).toContain('<code class="inkling-math-inline">x^2</code>')
    // Code: plain pre/code without the Shiki embed or copy-button hooks.
    expect(bodyHtmlFeed).toContain('<pre><code class="language-typescript">const a = 1 &lt; 2</code></pre>')
    expect(bodyHtmlFeed).not.toContain('data-code')
    expect(bodyHtmlFeed).not.toContain('<span class="line">')
    expect(bodyHtmlFeed).toContain('<p>after cards</p>')
  })

  it('renders the host-card feed shapes (solution unwrap, two-column flatten, music figure)', async () => {
    const { bodyHtmlFeed } = await computeBodyProjections(RICH_STATE)

    // solution unwraps to its bare content (pt-html.ts solution renderer).
    expect(bodyHtmlFeed).toContain('<p>答案 <strong>42</strong></p>')
    expect(bodyHtmlFeed).not.toContain('solution-begin')
    // two-column flattens to left + right content without the grid.
    expect(bodyHtmlFeed).toContain('<p>左栏</p><p>右栏</p>')
    expect(bodyHtmlFeed).not.toContain('data-pt-two-column')
    // music-player renders the PT feed figure from the meta snapshot
    // (jsdom serializes void tags without ` />` and boolean attrs as `=""`).
    expect(bodyHtmlFeed).toContain(
      '<figure><img src="/storage/music/cover.png" alt="Song"><audio controls="" preload="none" src="/storage/music/song.mp3"></audio><figcaption>🎵 Song — Artist</figcaption></figure>',
    )
  })

  it('renders the music-player placeholder paragraph when the meta snapshot is absent', async () => {
    const state = parse(lexicalBodyWith([{ type: 'music-player', version: 1, playerId: 'p1' }]))
    const { bodyHtml, bodyHtmlFeed } = await computeBodyProjections(state)
    expect(bodyHtmlFeed).toContain('<p>🎵 此文章包含音乐播放器，请访问原文收听。</p>')
    // Full fidelity keeps the unresolved-player mount point (today's SSR shape).
    expect(bodyHtml).toContain('<div class="aplayer" data-id="p1"></div>')
  })

  it('keeps the footnotes section intact in the feed variant', async () => {
    const { bodyHtmlFeed } = await computeBodyProjections(FOOTNOTE_STATE)
    expect(bodyHtmlFeed).toContain('<h3 id="footnotes-section-heading">尾声礼记</h3>')
  })
})

describe('infra/pt/lexical-projection — plain text', () => {
  it('extracts the search corpus without a DOM, host-card content included', async () => {
    const { bodyText } = await computeBodyProjections(RICH_STATE)
    expect(bodyText).toBe(
      // The image contributes its alt text (PT pushBlockText parity), the
      // music-player its snapshot name/artist.
      '你好 世界\n\nHello <world> & 你好\n\nE=mc^2\n\ninline \n\nconst a = 1 < 2\n\ncover\n\nSong\nArtist\n\n左栏\n右栏\n\n答案 42\n\nafter cards',
    )
  })
})
