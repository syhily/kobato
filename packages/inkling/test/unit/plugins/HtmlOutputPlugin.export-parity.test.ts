/**
 * Cross-path identity pin for the editor's two HTML export paths:
 *
 * - LIVE: `HtmlOutputPlugin` (src/plugins/HtmlOutputPlugin.tsx) exports from
 *   the mounted editor by running the shared serializer —
 *   `$convertToHtmlString` + Inkling's element transformers — inside
 *   `editor.read()`. The helper below drives that exact call against an
 *   editor configured like `InklingComposer` (DEFAULT_NODES + defaultTheme);
 *   the plugin's remaining behaviour (empty-document guard, debounce) is
 *   covered by HtmlOutputPlugin.test.ts.
 * - HEADLESS: `lexicalStateToHtml` (src/html/headless-html.ts) renders a
 *   serialized state via the same `$convertToHtmlString` and transformers
 *   (src/html/renderer/transformers/element/).
 *
 * Both paths run ONE serializer, so their output is byte-identical for any
 * document content. Every case pins that single output and asserts the two
 * paths agree exactly. The suite fails if either path's output changes — an
 * intentional change means updating the pinned strings deliberately.
 *
 * One input-dependent exception, by design: the headless renderer registers a
 * pre-render transform that removes temporary AtLinkNodes (mid-search link
 * placeholders) before serializing; the live adapter cannot mutate the
 * document it exports, so an in-progress at-link search serializes as its
 * inline query text instead. Those nodes never appear in persisted content,
 * so no case here covers them.
 *
 * The horizontal-rule case is the card control: cards share one exportDOM
 * implementation across both paths, so their markup must stay byte-identical.
 * If it ever diverges, a card stopped sharing its exportDOM implementation.
 */

import { describe, expect, it } from 'vitest'

// The two render paths under comparison live in the shared harness:
// renderLive drives the HtmlOutputPlugin route (same node set and theme
// InklingComposer passes to LexicalComposer, same $convertToHtmlString call
// inside editor.read()); renderHeadless goes through the public seam.
import { renderHeadless, renderLive } from '#/utils/render-live'

const text = (content: string, format = 0) => ({
  type: 'text',
  version: 1,
  detail: 0,
  format,
  mode: 'normal',
  style: '',
  text: content,
})

const block = (type: string, children: unknown[], extra: Record<string, unknown> = {}) => ({
  type,
  version: 1,
  format: '',
  indent: 0,
  direction: 'ltr',
  children,
  ...extra,
})

const doc = (children: unknown[]) =>
  JSON.stringify({
    root: { children, direction: 'ltr', format: '', indent: 0, type: 'root', version: 1 },
  })

interface ExportPathCase {
  name: string
  input: string
  // The exact output both paths must produce, byte-for-byte.
  output: string
}

const cases: ExportPathCase[] = [
  {
    name: 'paragraph',
    input: doc([block('paragraph', [text('Plain text')])]),
    output: '<p>Plain text</p>',
  },
  {
    name: 'basic text formats',
    // Single semantic tags: strong, em, s, u, code.
    input: doc([
      block('paragraph', [
        text('bold', 1),
        text('italic', 2),
        text('strikethrough', 4),
        text('underline', 8),
        text('code', 16),
      ]),
    ]),
    output: '<p><strong>bold</strong><em>italic</em><s>strikethrough</s><u>underline</u><code>code</code></p>',
  },
  {
    name: 'subscript, superscript and highlight formats',
    input: doc([block('paragraph', [text('subscript', 32), text('superscript', 64), text('highlight', 128)])]),
    output: '<p><sub>subscript</sub><sup>superscript</sup><mark>highlight</mark></p>',
  },
  {
    name: 'text-transform formats',
    // lowercase/uppercase/capitalize have no semantic tag; TextContent emits
    // them as SPANs carrying inline text-transform styles so the format
    // survives serialization.
    input: doc([block('paragraph', [text('lowercase', 256), text('uppercase', 512), text('capitalize', 1024)])]),
    output:
      '<p><span style="text-transform: lowercase;">lowercase</span><span style="text-transform: uppercase;">uppercase</span><span style="text-transform: capitalize;">capitalize</span></p>',
  },
  {
    name: 'heading',
    // Both paths add the generated id
    // (src/html/renderer/transformers/element/simple-transformers.ts).
    input: doc([block('heading', [text('Heading one')], { tag: 'h1' })]),
    output: '<h1 id="heading-one">Heading one</h1>',
  },
  {
    name: 'duplicate headings',
    // Ids are deduped within one render (render-context tracking).
    input: doc([
      block('heading', [text('Heading one')], { tag: 'h1' }),
      block('heading', [text('Heading one')], { tag: 'h2' }),
    ]),
    output: '<h1 id="heading-one">Heading one</h1><h2 id="heading-one-1">Heading one</h2>',
  },
  {
    name: 'extended-heading',
    // Inkling's serialized heading type; both paths resolve it to
    // ExtendedHeadingNode and run the same heading transformer.
    input: doc([block('extended-heading', [text('Extended heading')], { tag: 'h3' })]),
    output: '<h3 id="extended-heading">Extended heading</h3>',
  },
  {
    name: 'quote',
    input: doc([block('quote', [text('A quote')])]),
    output: '<blockquote>A quote</blockquote>',
  },
  {
    name: 'aside',
    // The aside transformer renders the alt blockquote and flattens the inner
    // paragraph (transformers/element/simple-transformers.ts).
    input: doc([block('aside', [block('paragraph', [text('An aside')])])]),
    output: '<blockquote class="inkling-blockquote-alt">An aside</blockquote>',
  },
  {
    name: 'bullet list',
    input: doc([
      block('list', [block('listitem', [text('one')], { value: 1 }), block('listitem', [text('two')], { value: 2 })], {
        listType: 'bullet',
        start: 1,
        tag: 'ul',
      }),
    ]),
    output: '<ul><li>one</li><li>two</li></ul>',
  },
  {
    name: 'numbered list with start',
    input: doc([
      block('list', [block('listitem', [text('three')], { value: 3 })], { listType: 'number', start: 3, tag: 'ol' }),
    ]),
    output: '<ol start="3"><li>three</li></ol>',
  },
  {
    name: 'nested list',
    input: doc([
      block(
        'list',
        [
          block('listitem', [text('one')], { value: 1 }),
          block(
            'listitem',
            [
              block('list', [block('listitem', [text('nested')], { value: 1 })], {
                listType: 'bullet',
                start: 1,
                tag: 'ul',
              }),
            ],
            { value: 2 },
          ),
        ],
        { listType: 'bullet', start: 1, tag: 'ul' },
      ),
    ]),
    output: '<ul><li>one<ul><li>nested</li></ul></li></ul>',
  },
  {
    name: 'link',
    input: doc([
      block('paragraph', [
        block('link', [text('a link')], { url: 'https://example.com', rel: 'noopener', target: null, title: null }),
      ]),
    ]),
    output: '<p><a href="https://example.com" rel="noopener">a link</a></p>',
  },
  {
    name: 'paragraph with line break',
    input: doc([block('paragraph', [text('line one'), { type: 'linebreak', version: 1 }, text('line two')])]),
    output: '<p>line one<br>line two</p>',
  },
  {
    name: 'trailing empty paragraph',
    // The serializer drops the trailing blank paragraph Inkling keeps at the
    // end of a doc (convert-to-html-string.ts) — on both paths.
    input: doc([block('paragraph', [text('content')]), block('paragraph', [])]),
    output: '<p>content</p>',
  },
  {
    name: 'card (horizontal rule)',
    // Control case: cards share exportDOM across both paths, so their markup
    // is byte-identical. If this starts diverging, a card stopped sharing its
    // exportDOM implementation.
    input: doc([{ type: 'horizontalrule', version: 1 }]),
    output: '<hr>',
  },
  {
    name: 'card (math) with svg artifact',
    input: doc([
      { type: 'math', version: 1, tex: 'x^2', mathml: '', svg: '<svg viewBox="0 0 10 10"><path d="M0 0z"/></svg>' },
    ]),
    output: '<div class="inkling-card inkling-math-card"><svg viewBox="0 0 10 10"><path d="M0 0z"></path></svg></div>',
  },
  {
    name: 'card (math) tex fallback',
    input: doc([{ type: 'math', version: 1, tex: 'a < b', mathml: '', svg: '' }]),
    output: '<pre><code>a &lt; b</code></pre>',
  },
  {
    name: 'math inline spliced into text',
    // The string layer splices inline decorators into the text flow
    // (convert-to-html-string.ts); both paths run that one branch.
    input: doc([
      block('paragraph', [
        text('before '),
        {
          type: 'math-inline',
          version: 1,
          tex: 'x^2',
          mathml: '',
          svg: '<svg viewBox="0 0 10 10"><path d="M0 0z"/></svg>',
        },
        text(' after'),
      ]),
    ]),
    output:
      '<p>before <span class="inkling-math-inline"><svg viewBox="0 0 10 10"><path d="M0 0z"></path></svg></span> after</p>',
  },
]

describe('HTML export path parity (HtmlOutputPlugin vs LexicalHTMLRenderer)', () => {
  for (const { name, input, output } of cases) {
    it(`pins both paths for: ${name}`, async () => {
      const liveOutput = renderLive(input)
      const headlessOutput = await renderHeadless(input)

      expect(liveOutput).toBe(output)
      expect(headlessOutput).toBe(output)
      expect(liveOutput).toBe(headlessOutput)
    })
  }

  it('pins the generated heading ids both paths emit', async () => {
    const input = doc([
      block('heading', [text('Heading one')], { tag: 'h1' }),
      block('heading', [text('Heading one')], { tag: 'h2' }),
    ])

    const liveOutput = renderLive(input)
    const headlessOutput = await renderHeadless(input)

    // Both paths emit the same per-render-deduped heading ids.
    for (const html of [liveOutput, headlessOutput]) {
      expect(html).toContain('<h1 id="heading-one">')
      expect(html).toContain('<h2 id="heading-one-1">')
    }
  })
})
