import type {
  LexicalBody as LexicalBodyType,
  LexicalInlineNode,
  LexicalParagraphNode,
  LexicalTableCellNode,
  LexicalTextNode,
} from '@kobato/shared/lexical/schema'
import type { MusicPlayerBlockMeta } from '@kobato/shared/types/music'

import { TEST_BLOG_SETTINGS_BUNDLE } from '#/_helpers/blog-settings'

import { LexicalBody } from '@kobato/editor/lexical-html/LexicalBody'
import { lexicalBodyToHtml } from '@kobato/server/render/lexical-html/lexicalBodyToHtml'
import { BlogSettingsProvider } from '@kobato/shared/lib/blog-config-context'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

// React renderer vs string renderer structural equivalence: the same
// fixture rendered through `renderToStaticMarkup(<LexicalBody/>)` must
// equal the string renderer's default-mode output. The two renderers
// share the manifest constants, so any drift in class names, data
// attributes, or structure fails here.
//
// Normalization: React SSR emits a `srcset` attribute on images
// (computed from the client asset settings), which the pure string
// renderer cannot know — it is stripped before comparison. Code blocks
// and music players are excluded from the byte-equality fixture because
// their React form carries interactive chrome (copy button / APlayer
// widget) by design; they get targeted assertions below.

const musicMeta = (id: string): MusicPlayerBlockMeta | undefined => ({
  id,
  name: 'Song',
  artist: 'Artist',
  audioUrl: `https://cdn.example.com/${id}.mp3`,
  cover: 'https://cdn.example.com/song.jpg',
  lyric: '',
})

// --- fixtures ----------------------------------------------------------------

function base(format = ''): { direction: null; format: string; indent: 0; version: 1 } {
  return { direction: null, format, indent: 0, version: 1 }
}

function text(text: string, format = 0): LexicalTextNode {
  return { detail: 0, format, mode: 'normal', style: '', text, type: 'text', version: 1 }
}

function para(children: LexicalInlineNode[], format = ''): LexicalParagraphNode {
  return { ...base(format), type: 'paragraph', children, textFormat: 0, textStyle: '' }
}

function cell(headerState: number, inline: string, overrides: Partial<{ colSpan: number }> = {}): LexicalTableCellNode {
  return {
    ...base(),
    type: 'tablecell',
    backgroundColor: null,
    colSpan: overrides.colSpan ?? 1,
    headerState,
    rowSpan: 1,
    children: [para([text(inline)])],
  }
}

const equivalenceFixture: LexicalBodyType = {
  root: {
    ...base(),
    type: 'root',
    children: [
      { ...base(), type: 'heading', tag: 'h1', children: [text('Title')] },
      {
        ...base('center'),
        type: 'paragraph',
        children: [
          text('Hello '),
          text('world', 1),
          text(' mixed', 1 | 2),
          text(' code', 16),
          text(' strike', 4),
          text(' under', 8),
          {
            ...base(),
            type: 'link',
            url: 'https://example.com',
            rel: 'nofollow',
            target: '_blank',
            title: null,
            children: [text(' link')],
          },
          { type: 'linebreak', version: 1 },
          text('after break'),
          { type: 'mathInline', version: 1, tex: 'x', mathml: '<math><mi>x</mi></math>' },
          { type: 'mathInline', version: 1, tex: 'E=mc^2' },
          { type: 'footnoteRef', version: 1, targetKey: 'fn1', index: 1 },
        ],
        textFormat: 0,
        textStyle: '',
      },
      { ...base('right'), type: 'quote', children: [para([text('Quoted')])] },
      {
        ...base(),
        type: 'list',
        listType: 'bullet',
        start: 1,
        tag: 'ul',
        children: [
          {
            ...base(),
            type: 'listitem',
            value: 1,
            children: [
              para([text('One')]),
              {
                ...base(),
                type: 'list',
                listType: 'number',
                start: 1,
                tag: 'ol',
                children: [{ ...base(), type: 'listitem', value: 1, children: [para([text('Nested')])] }],
              },
            ],
          },
        ],
      },
      {
        type: 'image',
        version: 1,
        src: 'https://cdn.example.com/a.jpg',
        alt: 'Alt text',
        width: 800,
        height: 600,
        thumbhash: 'thumb',
        caption: 'A caption',
      },
      { type: 'image', version: 1, src: 'https://cdn.example.com/b.jpg' },
      { type: 'mathBlock', version: 1, tex: 'a', mathml: '<math><mi>a</mi></math>' },
      { type: 'mathBlock', version: 1, tex: 'b' },
      { type: 'horizontalrule', version: 1 },
      {
        ...base(),
        type: 'table',
        children: [
          { ...base(), type: 'tablerow', children: [cell(1, 'A'), cell(1, 'B')] },
          { ...base(), type: 'tablerow', children: [cell(2, 'C'), cell(0, 'D')] },
          { ...base(), type: 'tablerow', children: [cell(0, 'E', { colSpan: 2 })] },
        ],
      },
      {
        ...base(),
        type: 'solution',
        children: [{ ...base(), type: 'heading', tag: 'h3', children: [text('In solution')] }, para([text('Answer')])],
      },
      {
        ...base(),
        type: 'twoColumn',
        children: [
          { ...base(), type: 'twoColumnPane', side: 'left', children: [para([text('Left')])] },
          { ...base(), type: 'twoColumnPane', side: 'right', children: [para([text('Right')])] },
        ],
      },
      {
        ...base(),
        type: 'footnoteDefinition',
        index: 1,
        children: [para([text('Note first')]), para([text('Note last')])],
      },
    ],
  },
}

function reactSsr(body: LexicalBodyType, options: { headingSlugs?: readonly string[] } = {}): string {
  const html = renderToStaticMarkup(
    <BlogSettingsProvider value={TEST_BLOG_SETTINGS_BUNDLE}>
      <LexicalBody body={body} headingSlugs={options.headingSlugs} musicMeta={musicMeta} />
    </BlogSettingsProvider>,
  )
  // React SSR strips `srcset` normalization + empty srcSet attribute
  // (BlockImage computes it from the client asset settings).
  return html.replace(/ src[sS]et="[^"]*"/g, '')
}

describe('LexicalBody (React SSR) vs lexicalBodyToHtml (string)', () => {
  it('renders the shared fixture byte-identically', () => {
    const slugs = ['title-slug', 'solution-slug']
    expect(reactSsr(equivalenceFixture, { headingSlugs: slugs })).toBe(
      lexicalBodyToHtml(equivalenceFixture, { headingSlugs: slugs, musicMeta }),
    )
  })

  it('renders empty bodies identically', () => {
    const empty: LexicalBodyType = { root: { ...base(), type: 'root', children: [] } }
    expect(reactSsr(empty)).toBe(lexicalBodyToHtml(empty))
  })

  it('embeds the code block contract (copy-button chrome is React-only)', () => {
    const body: LexicalBodyType = {
      root: {
        ...base(),
        type: 'root',
        children: [{ ...base(), type: 'code', language: 'ts', children: [text('const x = 1')] }],
      },
    }
    const react = renderToStaticMarkup(
      <BlogSettingsProvider value={TEST_BLOG_SETTINGS_BUNDLE}>
        <LexicalBody body={body} />
      </BlogSettingsProvider>,
    )
    // The string contract fragment appears inside the interactive chrome.
    expect(react).toContain('<code class="language-ts" data-language="ts">const x = 1</code>')
    expect(react).toContain('code-block-wrapper')
    // The string renderer carries no chrome — just the contract.
    expect(lexicalBodyToHtml(body)).toBe(
      '<div class="portable-text-body"><pre><code class="language-ts" data-language="ts">const x = 1</code></pre></div>',
    )
  })

  it('renders server-prerendered highlightedHtml identically through both adapters', () => {
    const body: LexicalBodyType = {
      root: {
        ...base(),
        type: 'root',
        children: [
          {
            ...base(),
            type: 'code',
            language: 'ts',
            children: [text('const x = 1')],
            highlightedHtml: '<span class="line" style="color:#fff">const x = 1</span>',
          },
        ],
      },
    }
    const string = lexicalBodyToHtml(body)
    // The shiki artifact renders sanitized in default mode.
    expect(string).toBe(
      '<div class="portable-text-body"><pre><code class="language-ts" data-language="ts">' +
        '<span class="line" style="color:#fff">const x = 1</span></code></pre></div>',
    )
    const react = renderToStaticMarkup(
      <BlogSettingsProvider value={TEST_BLOG_SETTINGS_BUNDLE}>
        <LexicalBody body={body} />
      </BlogSettingsProvider>,
    )
    // The React twin injects the same sanitized markup through CodeBlock's
    // interactive chrome (copy button wrapper + header).
    expect(react).toContain('<span class="line" style="color:#fff">const x = 1</span>')
    expect(react).toContain('code-block-wrapper')
    // Script-bearing artifacts never survive the 'shiki' gate in either.
    const evil: LexicalBodyType = {
      root: {
        ...base(),
        type: 'root',
        children: [
          {
            ...base(),
            type: 'code',
            children: [text('a')],
            highlightedHtml: '<span>a</span><script>alert(1)</script>',
          },
        ],
      },
    }
    expect(lexicalBodyToHtml(evil)).not.toContain('script')
    expect(
      renderToStaticMarkup(
        <BlogSettingsProvider value={TEST_BLOG_SETTINGS_BUNDLE}>
          <LexicalBody body={evil} />
        </BlogSettingsProvider>,
      ),
    ).not.toContain('script')
  })

  it('shares the music wrapper class contract (inner widget vs feed form)', () => {
    const body: LexicalBodyType = {
      root: {
        ...base(),
        type: 'root',
        children: [
          { type: 'musicPlayer', version: 1, playerId: 'p1' },
          { type: 'musicPlayer', version: 1, playerId: 'p2', center: true },
        ],
      },
    }
    const react = renderToStaticMarkup(
      <BlogSettingsProvider value={TEST_BLOG_SETTINGS_BUNDLE}>
        <LexicalBody body={body} musicMeta={musicMeta} />
      </BlogSettingsProvider>,
    )
    expect(react).toContain(
      '<div class="mt-5 mb-[1.375rem] max-w-[21.875rem] max-xl:mx-auto max-md:mt-0 max-md:mb-5 max-md:max-w-full mx-auto max-md:mx-auto">' +
        '<div class="aplayer" data-id="p1"></div></div>',
    )
    expect(react).toContain(
      '<div class="mt-5 mb-[1.375rem] max-w-[21.875rem] max-xl:mx-auto max-md:mt-0 max-md:mb-5 max-md:max-w-full mx-auto max-md:mx-auto">' +
        '<div class="aplayer" data-id="p2"></div></div>',
    )
    const string = lexicalBodyToHtml(body, { musicMeta })
    expect(string).toContain(
      '<div class="mt-5 mb-[1.375rem] max-w-[21.875rem] max-xl:mx-auto max-md:mt-0 max-md:mb-5 max-md:max-w-full mx-auto max-md:mx-auto">' +
        '<figure><img src="https://cdn.example.com/song.jpg" alt="Song"/>' +
        '<audio controls preload="none" src="https://cdn.example.com/p1.mp3"></audio>' +
        '<figcaption>🎵 Song — Artist</figcaption></figure></div>',
    )
    expect(string).toContain(
      '<div class="mt-5 mb-[1.375rem] max-w-[21.875rem] max-xl:mx-auto max-md:mt-0 max-md:mb-5 max-md:max-w-full mx-auto max-md:mx-auto">' +
        '<figure><img src="https://cdn.example.com/song.jpg" alt="Song"/>' +
        '<audio controls preload="none" src="https://cdn.example.com/p2.mp3"></audio>' +
        '<figcaption>🎵 Song — Artist</figcaption></figure></div>',
    )
  })
})
