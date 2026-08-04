import type {
  LexicalBlockNode,
  LexicalBody,
  LexicalInlineNode,
  LexicalParagraphNode,
  LexicalTableCellNode,
  LexicalTextNode,
} from '@kobato/shared/lexical/schema'

import { convertPtBodyToLexical } from '@kobato/editor/lexical-core/mapping'
import { lexicalBodyToHtml } from '@kobato/editor/lexical-html/lexicalBodyToHtml'
import { describe, expect, it } from 'vitest'

// Byte-exact HTML contract tests for the Lexical string renderer. The
// expectations are the manifest contract (`@kobato/editor/lexical-html/
// manifest.ts`) derived from the PT render adapters (render.tsx /
// render-blocks.tsx / render-marks.tsx / pt-html.ts) — every class name,
// data attribute, and tag structure is pinned here so a drift in either
// the manifest or the renderer fails loudly. Fixtures come from
// `convertPtBodyToLexical` (PT → Lexical, R1) or are hand-written
// EditorState JSON for lexical-native shapes.

const musicMeta = (id: string) =>
  id === 'missing'
    ? undefined
    : {
        name: 'Song',
        artist: 'Artist',
        audioUrl: `https://cdn.example.com/${id}.mp3`,
        cover: 'https://cdn.example.com/song.jpg',
      }

// --- small hand-written JSON factories ---------------------------------------

function base(format = ''): { direction: null; format: string; indent: 0; version: 1 } {
  return { direction: null, format, indent: 0, version: 1 }
}

function text(text: string, format = 0): LexicalTextNode {
  return { detail: 0, format, mode: 'normal', style: '', text, type: 'text', version: 1 }
}

function para(children: LexicalInlineNode[], format = ''): LexicalParagraphNode {
  return { ...base(format), type: 'paragraph', children, textFormat: 0, textStyle: '' }
}

function body(...children: LexicalBlockNode[]): LexicalBody {
  return { root: { ...base(), type: 'root', children } }
}

// --- full-body fixture (PT fixture copied from pt-html.test.ts, spans typed) --

const fullPtBody = [
  {
    _type: 'block',
    _key: 'h1',
    style: 'h1',
    children: [{ _type: 'span', _key: 's1', text: 'Title', marks: [] }],
  },
  {
    _type: 'block',
    _key: 'p1',
    style: 'normal',
    children: [
      { _type: 'span', _key: 's2', text: 'Hello ', marks: [] },
      { _type: 'span', _key: 's3', text: 'world', marks: ['strong'] },
      { _type: 'span', _key: 's4', text: ' link', marks: ['m1'] },
    ],
    markDefs: [{ _key: 'm1', _type: 'link', href: 'https://example.com', rel: 'nofollow', target: '_blank' }],
  },
  {
    _type: 'image',
    _key: 'img1',
    src: 'https://cdn.example.com/a.jpg',
    alt: 'Alt text',
    width: 800,
    height: 600,
    caption: 'A caption',
  },
  {
    _type: 'code',
    _key: 'code1',
    language: 'ts',
    code: 'const x = 1',
  },
  {
    _type: 'mathBlock',
    _key: 'math1',
    tex: 'E = mc^2',
    svg: '<svg>E=mc²</svg>',
  },
  { _type: 'horizontalRule', _key: 'hr1' },
  {
    _type: 'musicPlayer',
    _key: 'music1',
    playerId: 'p1',
  },
  {
    _type: 'table',
    _key: 'table1',
    hasHeaderRow: true,
    rows: [
      {
        cells: [
          { content: [{ _type: 'span', _key: 'c1', text: 'Name', marks: [] }], isHeader: true },
          { content: [{ _type: 'span', _key: 'c2', text: 'Value', marks: [] }], isHeader: true },
        ],
      },
      {
        cells: [
          { content: [{ _type: 'span', _key: 'c3', text: 'A', marks: [] }] },
          { content: [{ _type: 'span', _key: 'c4', text: 'B', marks: [] }] },
        ],
      },
    ],
  },
  {
    _type: 'twoColumn',
    _key: 'two1',
    left: [
      {
        _type: 'block',
        _key: 'left1',
        style: 'normal',
        children: [{ _type: 'span', _key: 'ls1', text: 'Left', marks: [] }],
      },
    ],
    right: [
      {
        _type: 'block',
        _key: 'right1',
        style: 'normal',
        children: [{ _type: 'span', _key: 'rs1', text: 'Right', marks: [] }],
      },
    ],
  },
  {
    _type: 'solution',
    _key: 'sol1',
    children: [
      {
        _type: 'block',
        _key: 'solb1',
        style: 'normal',
        children: [{ _type: 'span', _key: 'ss1', text: 'Answer', marks: [] }],
      },
    ],
  },
  {
    _type: 'footnoteDefinition',
    _key: 'fn1',
    index: 1,
    children: [
      {
        _type: 'block',
        _key: 'fnb1',
        style: 'normal',
        children: [{ _type: 'span', _key: 'fs1', text: 'Note', marks: [] }],
      },
    ],
  },
]

describe('lexicalBodyToHtml — full-body contract (default mode)', () => {
  const html = lexicalBodyToHtml(convertPtBodyToLexical(fullPtBody as never), {
    headingSlugs: ['custom-title'],
    musicMeta,
  })

  it('renders the whole body byte-for-byte', () => {
    expect(html).toBe(
      '<div class="portable-text-body">' +
        '<h1 id="custom-title" class="scroll-mt-20">Title</h1>' +
        '<p>Hello <strong class="font-semibold text-ink-1">world</strong>' +
        '<a href="https://example.com" rel="nofollow noopener noreferrer" target="_blank" ' +
        'class="text-brand underline decoration-brand/40 underline-offset-2"> link</a></p>' +
        '<figure class="block max-w-full">' +
        '<img src="https://cdn.example.com/a.jpg" width="800" height="600" alt="Alt text" ' +
        'loading="lazy" decoding="async" sizes="100vw" ' +
        'class="transition-[filter] duration-300 dark:[filter:brightness(0.72)_contrast(0.95)_saturate(0.9)]"/>' +
        '<figcaption>A caption</figcaption></figure>' +
        '<pre><code class="language-ts" data-language="ts">const x = 1</code></pre>' +
        '<div class="math math-display text-center [&amp;_svg]:mx-auto [&amp;_svg]:block [&amp;_svg]:max-w-none">E=mc²</div>' +
        '<hr/>' +
        '<div class="mt-5 mb-[1.375rem] max-w-[21.875rem] max-xl:mx-auto max-md:mt-0 max-md:mb-5 max-md:max-w-full mx-auto max-md:mx-auto">' +
        '<figure><img src="https://cdn.example.com/song.jpg" alt="Song"/>' +
        '<audio controls preload="none" src="https://cdn.example.com/p1.mp3"></audio>' +
        '<figcaption>🎵 Song — Artist</figcaption></figure></div>' +
        '<div class="pt-table-wrapper overflow-x-auto"><table class="pt-table">' +
        '<thead><tr><th>Name</th><th>Value</th></tr></thead>' +
        '<tbody><tr><td>A</td><td>B</td></tr></tbody></table></div>' +
        '<section class="my-6 grid grid-cols-1 gap-6 md:grid-cols-2 md:gap-8" data-pt-two-column="">' +
        '<div class="min-w-0" data-pt-two-column-pane="" data-side="left"><p>Left</p></div>' +
        '<div class="min-w-0" data-pt-two-column-pane="" data-side="right"><p>Right</p></div></section>' +
        '<blockquote class="solution relative flow-root overflow-x-auto overflow-y-hidden p-[1.2rem] pr-9 pb-9 [-webkit-overflow-scrolling:touch]">' +
        '<div class="solution-begin mb-2 block text-[1.2rem] font-extrabold text-brand">解：</div>' +
        '<p>Answer</p>' +
        '<span class="solution-qed pointer-events-none absolute right-3 bottom-3 inline-flex h-3.5 w-3.5 items-center justify-center text-ink-3" aria-hidden="true">' +
        '<svg viewBox="0 0 14 14" class="block h-full w-full" fill="none" stroke="currentColor" stroke-width="1.5">' +
        '<rect x="1" y="1" width="12" height="12"></rect></svg></span></blockquote>' +
        '<section class="footnotes" data-footnotes="" aria-labelledby="footnotes-section-heading">' +
        '<h3 id="footnotes-section-heading" class="mt-10 mb-3 scroll-mt-20 text-lg font-semibold text-ink-1">尾声礼记</h3>' +
        '<ol><li id="user-content-fn-1"><p>Note' +
        '<a href="#user-content-fnref-1" data-footnote-backref="" aria-label="返回引用" class="data-footnote-backref">↩</a>' +
        '</p></li></ol></section>' +
        '</div>',
    )
  })
})

describe('lexicalBodyToHtml — block contract (default mode)', () => {
  it('aligns paragraphs and blockquotes, zips heading slugs by render position', () => {
    const html = lexicalBodyToHtml(
      body(
        { ...base('center'), type: 'paragraph', children: [text('Center')], textFormat: 0, textStyle: '' },
        { ...base('right'), type: 'quote', children: [para([text('Q')])] },
        { ...base(), type: 'heading', tag: 'h2', children: [text('Section')] },
      ),
      { headingSlugs: ['section-slug'] },
    )
    expect(html).toBe(
      '<div class="portable-text-body">' +
        '<p class="text-center">Center</p>' +
        '<blockquote class="text-right"><p>Q</p></blockquote>' +
        '<h2 id="section-slug" class="scroll-mt-20">Section</h2>' +
        '</div>',
    )
  })

  it('skips empty-text headings as slots and leaves them without an id', () => {
    const html = lexicalBodyToHtml(
      body(
        { ...base(), type: 'heading', tag: 'h1', children: [] },
        { ...base(), type: 'heading', tag: 'h1', children: [text('Real')] },
      ),
      { headingSlugs: ['real-slug'] },
    )
    expect(html).toBe(
      '<div class="portable-text-body">' +
        '<h1 class="scroll-mt-20"></h1>' +
        '<h1 id="real-slug" class="scroll-mt-20">Real</h1>' +
        '</div>',
    )
  })

  it('falls back to a body-wide Slugger (deduped) when slugs run out', () => {
    const html = lexicalBodyToHtml(
      body(
        { ...base(), type: 'heading', tag: 'h2', children: [text('Hello')] },
        { ...base(), type: 'heading', tag: 'h2', children: [text('Hello')] },
      ),
      { headingSlugs: [] },
    )
    expect(html).toBe(
      '<div class="portable-text-body">' +
        '<h2 id="hello" class="scroll-mt-20">Hello</h2>' +
        '<h2 id="hello-1" class="scroll-mt-20">Hello</h2>' +
        '</div>',
    )
  })

  it('renders nested lists from the lexical tree', () => {
    const html = lexicalBodyToHtml(
      body({
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
                children: [
                  {
                    ...base(),
                    type: 'listitem',
                    value: 1,
                    children: [para([text('Nested')])],
                  },
                ],
              },
            ],
          },
        ],
      }),
    )
    expect(html).toBe(
      '<div class="portable-text-body">' + '<ul><li><p>One</p><ol><li><p>Nested</p></li></ol></li></ul>' + '</div>',
    )
  })

  it('renders code with language class/data even without text children', () => {
    const html = lexicalBodyToHtml(body({ ...base(), type: 'code', language: 'js', children: [text('let x')] }))
    expect(html).toBe(
      '<div class="portable-text-body"><pre><code class="language-js" data-language="js">let x</code></pre></div>',
    )
  })

  it('renders image layouts, thumbhash, missing alt, and the aspect-ratio style without dimensions', () => {
    const html = lexicalBodyToHtml(
      body(
        {
          type: 'image',
          version: 1,
          src: 'https://cdn.example.com/l.jpg',
          layout: 'left',
          thumbhash: 'th',
        },
        { type: 'image', version: 1, src: 'https://cdn.example.com/r.jpg', layout: 'right', width: 100, height: 50 },
      ),
    )
    expect(html).toBe(
      '<div class="portable-text-body">' +
        '<figure class="block max-w-full mr-auto ml-0 w-fit">' +
        '<img src="https://cdn.example.com/l.jpg" data-thumbhash="th" alt="" ' +
        'loading="lazy" decoding="async" sizes="100vw" ' +
        'class="transition-[filter] duration-300 dark:[filter:brightness(0.72)_contrast(0.95)_saturate(0.9)]" ' +
        'style="aspect-ratio:16/9"/></figure>' +
        '<figure class="block max-w-full mr-0 ml-auto w-fit">' +
        '<img src="https://cdn.example.com/r.jpg" width="100" height="50" alt="" ' +
        'loading="lazy" decoding="async" sizes="100vw" ' +
        'class="transition-[filter] duration-300 dark:[filter:brightness(0.72)_contrast(0.95)_saturate(0.9)]"/></figure>' +
        '</div>',
    )
  })

  it('rebuilds thead/tbody from headerState bits, honoring mixed column headers and spans', () => {
    const cell = (
      headerState: number,
      inline: string,
      overrides: Partial<{ colSpan: number; rowSpan: number }> = {},
    ): LexicalTableCellNode => ({
      ...base(),
      type: 'tablecell',
      backgroundColor: null,
      colSpan: overrides.colSpan ?? 1,
      headerState,
      rowSpan: overrides.rowSpan ?? 1,
      children: [para([text(inline)])],
    })
    const html = lexicalBodyToHtml(
      body({
        ...base(),
        type: 'table',
        children: [
          { ...base(), type: 'tablerow', children: [cell(1, 'A'), cell(1, 'B')] },
          { ...base(), type: 'tablerow', children: [cell(2, 'C'), cell(0, 'D')] },
          { ...base(), type: 'tablerow', children: [cell(0, 'E', { colSpan: 2, rowSpan: 2 })] },
        ],
      }),
    )
    expect(html).toBe(
      '<div class="portable-text-body">' +
        '<div class="pt-table-wrapper overflow-x-auto"><table class="pt-table">' +
        '<thead><tr><th>A</th><th>B</th></tr></thead>' +
        '<tbody><tr><th>C</th><td>D</td></tr><tr><td colSpan="2" rowSpan="2">E</td></tr></tbody>' +
        '</table></div></div>',
    )
  })

  it('renders a headerless table without thead and wrapper classes off default', () => {
    const cell = (inline: string): LexicalTableCellNode => ({
      ...base(),
      type: 'tablecell',
      backgroundColor: null,
      colSpan: 1,
      headerState: 0,
      rowSpan: 1,
      children: [para([text(inline)])],
    })
    const table: LexicalBlockNode = {
      ...base(),
      type: 'table',
      children: [{ ...base(), type: 'tablerow', children: [cell('Only')] }],
    }
    expect(lexicalBodyToHtml(body(table))).toBe(
      '<div class="portable-text-body"><div class="pt-table-wrapper overflow-x-auto"><table class="pt-table">' +
        '<tbody><tr><td>Only</td></tr></tbody></table></div></div>',
    )
    expect(lexicalBodyToHtml(body(table), { mode: 'rss' })).toBe('<table><tbody><tr><td>Only</td></tr></tbody></table>')
  })

  it('renders footnote refs with the anchor contract and definitions with backrefs', () => {
    const html = lexicalBodyToHtml(
      body(
        {
          ...base(),
          type: 'paragraph',
          children: [text('See '), { type: 'footnoteRef', version: 1, targetKey: 'fn1', index: 1 }],
          textFormat: 0,
          textStyle: '',
        },
        {
          ...base(),
          type: 'footnoteDefinition',
          index: 1,
          children: [para([text('Note text')])],
        },
      ),
    )
    expect(html).toBe(
      '<div class="portable-text-body">' +
        '<p>See <sup id="user-content-fnref-1" data-footnote-ref="">' +
        '<a href="#user-content-fn-1" class="footnote-ref">1</a></sup></p>' +
        '<section class="footnotes" data-footnotes="" aria-labelledby="footnotes-section-heading">' +
        '<h3 id="footnotes-section-heading" class="mt-10 mb-3 scroll-mt-20 text-lg font-semibold text-ink-1">尾声礼记</h3>' +
        '<ol><li id="user-content-fn-1"><p>Note text' +
        '<a href="#user-content-fnref-1" data-footnote-backref="" aria-label="返回引用" class="data-footnote-backref">↩</a>' +
        '</p></li></ol></section></div>',
    )
  })

  it('appends a bare backref paragraph when the definition ends with a non-paragraph block', () => {
    const html = lexicalBodyToHtml(
      body({
        ...base(),
        type: 'footnoteDefinition',
        index: 2,
        children: [
          {
            ...base(),
            type: 'list',
            listType: 'bullet',
            start: 1,
            tag: 'ul',
            children: [{ ...base(), type: 'listitem', value: 1, children: [para([text('Item')])] }],
          },
        ],
      }),
      { footnotesSectionTitle: 'Notes' },
    )
    expect(html).toBe(
      '<div class="portable-text-body">' +
        '<section class="footnotes" data-footnotes="" aria-labelledby="footnotes-section-heading">' +
        '<h3 id="footnotes-section-heading" class="mt-10 mb-3 scroll-mt-20 text-lg font-semibold text-ink-1">Notes</h3>' +
        '<ol><li id="user-content-fn-2"><ul><li><p>Item</p></li></ul>' +
        '<p><a href="#user-content-fnref-2" data-footnote-backref="" aria-label="返回引用" class="data-footnote-backref">↩</a>' +
        '</p></li></ol></section></div>',
    )
  })
})

describe('lexicalBodyToHtml — inline contract (default mode)', () => {
  it('wraps decorator format bits in ascending bit order with PT_INLINE classes', () => {
    const html = lexicalBodyToHtml(body(para([text('both', 1 | 2), text('code', 16), text('strike-under', 4 | 8)])))
    expect(html).toBe(
      '<div class="portable-text-body"><p>' +
        // bits wrap in ascending order; later bits end up OUTER (bit 2 wraps bit 1).
        '<em class="italic"><strong class="font-semibold text-ink-1">both</strong></em>' +
        '<code class="rounded bg-muted/80 px-1 py-0.5 font-mono text-[0.875em] text-ink-3">code</code>' +
        '<u class="underline underline-offset-2"><s class="line-through text-ink-3">strike-under</s></u>' +
        '</p></div>',
    )
  })

  it('renders links with safeRel/sanitizeUrl and omits null rel/target', () => {
    const html = lexicalBodyToHtml(
      body(
        para([
          {
            ...base(),
            type: 'link',
            url: 'https://example.com',
            rel: null,
            target: null,
            title: null,
            children: [text('plain')],
          },
          {
            ...base(),
            type: 'link',
            url: 'javascript:alert(1)',
            rel: 'noopener',
            target: '_blank',
            title: null,
            children: [text('bad')],
          },
        ]),
      ),
    )
    expect(html).toBe(
      '<div class="portable-text-body"><p>' +
        '<a href="https://example.com" class="text-brand underline decoration-brand/40 underline-offset-2">plain</a>' +
        '<a href="#" rel="noopener noreferrer" target="_blank" ' +
        'class="text-brand underline decoration-brand/40 underline-offset-2">bad</a>' +
        '</p></div>',
    )
  })

  it('renders mathInline markup sanitized and the TeX fallback', () => {
    const html = lexicalBodyToHtml(
      body(
        para([
          { type: 'mathInline', version: 1, tex: 'x', mathml: '<math><mi>x</mi></math>' },
          { type: 'mathInline', version: 1, tex: 'y', svg: '<svg>y</svg>' },
          { type: 'mathInline', version: 1, tex: 'E=mc^2' },
        ]),
      ),
    )
    expect(html).toBe(
      '<div class="portable-text-body"><p>' +
        '<span class="math-inline inline-block align-middle"><math><mi>x</mi></math></span>' +
        // svg is NOT in the 'math' sanitize allowlist — stripped to text.
        '<span class="math-inline inline-block align-middle">y</span>' +
        '<span class="math-inline inline-block align-middle">' +
        '<code class="math-inline rounded bg-muted/50 px-0.5 font-mono text-ink-3">E=mc^2</code></span>' +
        '</p></div>',
    )
  })

  it('renders mathBlock mathml and TeX fallback with display classes', () => {
    const html = lexicalBodyToHtml(
      body(
        { type: 'mathBlock', version: 1, tex: 'a', mathml: '<math><mi>a</mi></math>' },
        { type: 'mathBlock', version: 1, tex: 'b' },
      ),
    )
    expect(html).toBe(
      '<div class="portable-text-body">' +
        '<div class="math math-display text-center [&amp;_svg]:mx-auto [&amp;_svg]:block [&amp;_svg]:max-w-none"><math><mi>a</mi></math></div>' +
        '<pre class="math math-display"><code>b</code></pre>' +
        '</div>',
    )
  })

  it('renders hard breaks and escapes text content like React', () => {
    const html = lexicalBodyToHtml(body(para([text('a"b&c<d>e'), { type: 'linebreak', version: 1 }, text('next')])))
    expect(html).toBe('<div class="portable-text-body"><p>a&quot;b&amp;c&lt;d&gt;e<br/>next</p></div>')
  })

  it('renders empty body and empty paragraphs', () => {
    expect(lexicalBodyToHtml(body())).toBe('<div class="portable-text-body"></div>')
    expect(lexicalBodyToHtml(body(para([])))).toBe('<div class="portable-text-body"><p></p></div>')
  })

  it('defends against unknown node types (gate-bypass)', () => {
    const html = lexicalBodyToHtml(
      body(para([text('ok')]), { type: 'mysteryNode', version: 1 } as unknown as LexicalBlockNode),
    )
    expect(html).toBe('<div class="portable-text-body"><p>ok</p></div>')
  })
})

describe('lexicalBodyToHtml — rss mode (pt-html.ts degraded branch)', () => {
  it('renders classless with TeX/text fallbacks and concatenated twoColumn', () => {
    const html = lexicalBodyToHtml(
      body(
        { ...base(), type: 'heading', tag: 'h1', children: [text('Section')] },
        para([text('Hi'), { type: 'mathInline', version: 1, tex: 'a', svg: '<svg>a</svg>' }]),
        { type: 'mathBlock', version: 1, tex: 'y' },
        { ...base(), type: 'code', language: 'ts', children: [text('raw code')] },
        {
          ...base(),
          type: 'twoColumn',
          children: [
            { ...base(), type: 'twoColumnPane', side: 'left', children: [para([text('L')])] },
            { ...base(), type: 'twoColumnPane', side: 'right', children: [para([text('R')])] },
          ],
        },
        {
          ...base(),
          type: 'paragraph',
          children: [{ type: 'footnoteRef', version: 1, targetKey: 'fn1', index: 1 }],
          textFormat: 0,
          textStyle: '',
        },
        { ...base(), type: 'footnoteDefinition', index: 1, children: [para([text('Note')])] },
      ),
      { headingSlugs: ['section'], mode: 'rss', musicMeta: () => undefined },
    )
    expect(html).toBe(
      '<h1 id="section">Section</h1>' +
        '<p>Hi<code>a</code></p>' +
        '<pre><code>y</code></pre>' +
        '<pre><code class="language-ts" data-language="ts">raw code</code></pre>' +
        '<p>L</p><p>R</p>' +
        '<p><sup><a href="#user-content-fn-1">1</a></sup></p>' +
        '<section data-footnotes="" aria-labelledby="footnotes-section-heading">' +
        '<h3 id="footnotes-section-heading">尾声礼记</h3>' +
        '<ol><li id="user-content-fn-1"><p>Note' +
        '<a href="#user-content-fnref-1" data-footnote-backref="" aria-label="返回引用">↩</a>' +
        '</p></li></ol></section>',
    )
  })

  it('renders the music player figure+audio and the missing-meta placeholder', () => {
    const html = lexicalBodyToHtml(
      body(
        { type: 'musicPlayer', version: 1, playerId: 'p1' },
        { type: 'musicPlayer', version: 1, playerId: 'missing' },
      ),
      { musicMeta, mode: 'rss' },
    )
    expect(html).toBe(
      '<figure><img src="https://cdn.example.com/song.jpg" alt="Song"/>' +
        '<audio controls preload="none" src="https://cdn.example.com/p1.mp3"></audio>' +
        '<figcaption>🎵 Song — Artist</figcaption></figure>' +
        '<p>🎵 此文章包含音乐播放器，请访问原文收听。</p>',
    )
  })
})

describe('lexicalBodyToHtml — email mode (provisional classless form)', () => {
  it('drops every class attribute but keeps structure and sanitized markup', () => {
    const html = lexicalBodyToHtml(
      body(
        { ...base(), type: 'heading', tag: 'h2', children: [text('H')] },
        para([text('a"b'), { type: 'mathInline', version: 1, tex: 'x', mathml: '<math><mi>x</mi></math>' }]),
        { type: 'mathBlock', version: 1, tex: 'y', mathml: '<math><mi>y</mi></math>' },
        { ...base(), type: 'code', language: 'ts', children: [text('raw')] },
        {
          type: 'image',
          version: 1,
          src: 'https://cdn.example.com/i.jpg',
          alt: 'I',
          width: 100,
          height: 50,
        },
        {
          ...base(),
          type: 'twoColumn',
          children: [
            { ...base(), type: 'twoColumnPane', side: 'left', children: [para([text('L')])] },
            { ...base(), type: 'twoColumnPane', side: 'right', children: [para([text('R')])] },
          ],
        },
        { ...base(), type: 'footnoteDefinition', index: 1, children: [para([text('N')])] },
      ),
      { headingSlugs: ['h-slug'], mode: 'email' },
    )
    // The ONLY class attribute in email mode is the code language class
    // (pt-html's RSS branch keeps it too).
    expect(html.match(/ class=/g)).toEqual([' class='])
    expect(html).toBe(
      '<h2 id="h-slug">H</h2>' +
        '<p>a&quot;b<span><math><mi>x</mi></math></span></p>' +
        '<div><math><mi>y</mi></math></div>' +
        '<pre><code class="language-ts" data-language="ts">raw</code></pre>' +
        '<figure><img src="https://cdn.example.com/i.jpg" width="100" height="50" alt="I"/></figure>' +
        '<section data-pt-two-column=""><div data-pt-two-column-pane="" data-side="left"><p>L</p></div>' +
        '<div data-pt-two-column-pane="" data-side="right"><p>R</p></div></section>' +
        '<section data-footnotes="" aria-labelledby="footnotes-section-heading">' +
        '<h3 id="footnotes-section-heading">尾声礼记</h3>' +
        '<ol><li id="user-content-fn-1"><p>N' +
        '<a href="#user-content-fnref-1" data-footnote-backref="" aria-label="返回引用">↩</a>' +
        '</p></li></ol></section>',
    )
  })
})
