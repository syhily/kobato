import type { LexicalCommentBody } from '@kobato/shared/lexical/comment-schema'

import { lexicalCommentBodyToHtml } from '@kobato/server/render/lexical-html/comment-to-html'
import { MATH_DISPLAY_CLASS } from '@kobato/shared/lexical/html-manifest'
import { describe, expect, it } from 'vitest'

// Pin the comment renderer contract. `default` mirrors the body
// renderer's structure on the comment subset (manifest classes, math
// markup, `<p>` wrappers inside quote/listitem, `portable-text-body`
// wrapper); `email` mirrors the R2 legacy `commentBodyToHtml` semantics
// (classless, TeX-only math, legacy decorator order, legacy link
// defaults, bare inline runs inside blockquote/listitem, no wrapper).

function elementBase(): { direction: null; format: string; indent: 0; version: 1 } {
  return { direction: null, format: '', indent: 0, version: 1 }
}

function paragraph(children: unknown[]) {
  return { ...elementBase(), type: 'paragraph' as const, children, textFormat: 0, textStyle: '' }
}

function text(text: string, format = 0) {
  return { detail: 0, format, mode: 'normal' as const, style: '', text, type: 'text' as const, version: 1 }
}

function link(url: string, children: unknown[], extra: Record<string, unknown> = {}) {
  return { ...elementBase(), type: 'link' as const, url, rel: null, target: null, title: null, ...extra, children }
}

function quote(children: unknown[]) {
  return { ...elementBase(), type: 'quote' as const, children }
}

function list(items: unknown[]) {
  return {
    ...elementBase(),
    type: 'list' as const,
    listType: 'bullet' as const,
    start: 1,
    tag: 'ul' as const,
    children: items,
  }
}

function listItem(children: unknown[]) {
  return { ...elementBase(), type: 'listitem' as const, value: 1, children }
}

function codeBlock(children: unknown[], language?: string) {
  return { ...elementBase(), type: 'code' as const, ...(language !== undefined ? { language } : {}), children }
}

function mathBlock(tex: string, mathml?: string) {
  return { type: 'mathBlock' as const, version: 1, tex, ...(mathml !== undefined ? { mathml } : {}) }
}

function body(children: unknown[]): LexicalCommentBody {
  return { root: { ...elementBase(), type: 'root', children } } as LexicalCommentBody
}

const PT_INLINE = {
  strong: 'font-semibold text-ink-1',
  em: 'italic',
  strike: 'line-through text-ink-3',
  underline: 'underline underline-offset-2',
  code: 'rounded bg-muted/80 px-1 py-0.5 font-mono text-[0.875em] text-ink-3',
  link: 'text-brand underline decoration-brand/40 underline-offset-2',
  mathTex: 'math-inline rounded bg-muted/50 px-0.5 font-mono text-ink-3',
}

const ESCAPED_MATH_DISPLAY_CLASS = MATH_DISPLAY_CLASS.replaceAll('&', '&amp;')

const FIXTURE: LexicalCommentBody = body([
  paragraph([
    text('Hello '),
    text('bold', 1),
    text(' '),
    text('em', 2),
    text(' '),
    text('strike', 4),
    text(' '),
    text('under', 8),
    text(' '),
    text('code', 16),
  ]),
  paragraph([link('https://example.com', [text('docs')])]),
  paragraph([text('a '), { type: 'mathInline', version: 1, tex: 'x^2', mathml: '<math><mi>x</mi></math>' }]),
  quote([paragraph([text('quoted')])]),
  list([listItem([paragraph([text('item1')]), list([listItem([paragraph([text('nested')])])])])]),
  codeBlock([text('const a = 1')], 'ts'),
  mathBlock('a^2'),
])

describe('server/render/lexical-html/comment-to-html', () => {
  it('default mode: classful body-renderer structure on the comment subset', () => {
    const html = lexicalCommentBodyToHtml(FIXTURE)
    expect(html).toBe(
      '<div class="portable-text-body">' +
        `<p>Hello <strong class="${PT_INLINE.strong}">bold</strong> <em class="${PT_INLINE.em}">em</em> ` +
        `<s class="${PT_INLINE.strike}">strike</s> <u class="${PT_INLINE.underline}">under</u> ` +
        `<code class="${PT_INLINE.code}">code</code></p>` +
        `<p><a href="https://example.com" class="${PT_INLINE.link}">docs</a></p>` +
        `<p>a <span class="math-inline inline-block align-middle"><math><mi>x</mi></math></span></p>` +
        '<blockquote><p>quoted</p></blockquote>' +
        '<ul><li><p>item1</p><ul><li><p>nested</p></li></ul></li></ul>' +
        '<pre><code class="language-ts" data-language="ts">const a = 1</code></pre>' +
        // TeX fallback carries the same class pair the React twin emits
        // (`math math-display`), NOT the full MATH_DISPLAY_CLASS.
        '<pre class="math math-display"><code>a^2</code></pre>' +
        '</div>',
    )
  })

  it('default mode: escaped text, sanitized math markup, link rel defaults', () => {
    const html = lexicalCommentBodyToHtml(
      body([
        paragraph([text('a < b & c > d')]),
        paragraph([link('javascript:alert(1)', [text('evil')])]),
        paragraph([link('https://example.com', [text('newtab')], { rel: 'noreferrer', target: '_blank' })]),
        paragraph([text('inline '), { type: 'mathInline', version: 1, tex: 'x<y' }]),
        mathBlock('a', '<math><mi>a</mi><script>alert(1)</script></math>'),
      ]),
    )
    expect(html).toContain('<p>a &lt; b &amp; c &gt; d</p>')
    // Defense-in-depth: executable URLs never leak through.
    expect(html).not.toContain('javascript:')
    // `_blank` targets gain noopener + noreferrer (safeRel).
    expect(html).toContain('rel="noreferrer noopener" target="_blank"')
    // TeX fallback for math without markup (classful).
    expect(html).toContain(
      `<span class="math-inline inline-block align-middle"><code class="${PT_INLINE.mathTex}">x&lt;y</code></span>`,
    )
    // MathML passes the sanitizer minus the script.
    expect(html).toContain(`<div class="${ESCAPED_MATH_DISPLAY_CLASS}"><math><mi>a</mi></math></div>`)
  })

  it('email mode: classless legacy commentBodyToHtml semantics', () => {
    const html = lexicalCommentBodyToHtml(FIXTURE, { mode: 'email' })
    expect(html).toBe(
      '<p>Hello <strong>bold</strong> <em>em</em> <del>strike</del> <u>under</u> <code>code</code></p>' +
        '<p><a href="https://example.com" rel="nofollow noreferrer" target="_blank">docs</a></p>' +
        '<p>a <code>$x^2$</code></p>' +
        '<blockquote>quoted</blockquote>' +
        '<ul><li>item1<ul><li>nested</li></ul></li></ul>' +
        '<pre><code data-language="ts">const a = 1</code></pre>' +
        '<pre><code>$$a^2$$</code></pre>',
    )
  })

  it('email mode: code decorator wins, explicit link rel/target kept, linebreaks', () => {
    const html = lexicalCommentBodyToHtml(
      body([
        paragraph([text('bold+code', 1 + 16), text(' '), { type: 'linebreak', version: 1 }, text('next')]),
        paragraph([link('https://example.com', [text('kept')], { rel: 'noreferrer', target: '_blank' })]),
        codeBlock([text('no language')]),
      ]),
      { mode: 'email' },
    )
    expect(html).toBe(
      '<p><code>bold+code</code> <br/>next</p>' +
        '<p><a href="https://example.com" rel="noreferrer" target="_blank">kept</a></p>' +
        '<pre><code>no language</code></pre>',
    )
  })

  it('renders the runtime listitem shape (inline children directly in the item)', () => {
    const runtimeShape: LexicalCommentBody = body([
      list([
        listItem([text('item '), { type: 'mathInline', version: 1, tex: 'x' }, list([listItem([text('nested')])])]),
      ]),
    ])
    expect(lexicalCommentBodyToHtml(runtimeShape)).toBe(
      '<div class="portable-text-body">' +
        '<ul><li>item <span class="math-inline inline-block align-middle"><code class="' +
        PT_INLINE.mathTex +
        '">x</code></span><ul><li>nested</li></ul></li></ul></div>',
    )
    expect(lexicalCommentBodyToHtml(runtimeShape, { mode: 'email' })).toBe(
      '<ul><li>item <code>$x$</code><ul><li>nested</li></ul></li></ul>',
    )
  })

  it('escapes HTML in text and attributes in both modes', () => {
    const fixture = body([
      paragraph([text('<script>alert(1)</script>')]),
      paragraph([link('https://example.com/?a=1&b="x"', [text('attr')])]),
    ])
    const defaultHtml = lexicalCommentBodyToHtml(fixture)
    expect(defaultHtml).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(defaultHtml).toContain('href="https://example.com/?a=1&amp;b=&quot;x&quot;"')
    const emailHtml = lexicalCommentBodyToHtml(fixture, { mode: 'email' })
    expect(emailHtml).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(emailHtml).toContain('href="https://example.com/?a=1&amp;b=&quot;x&quot;"')
  })

  it('default mode: server-prerendered highlightedHtml renders sanitized, email stays plain', () => {
    // Attach the Shiki artifact to the first block only.
    const highlighted = body([
      {
        ...elementBase(),
        type: 'code',
        language: 'ts',
        children: [text('const x = 1')],
        highlightedHtml: '<span class="line" style="color:#fff">const x = 1</span>',
      },
      { ...elementBase(), type: 'code', children: [text('const y = 2')] },
    ])
    const defaultHtml = lexicalCommentBodyToHtml(highlighted)
    expect(defaultHtml).toContain(
      '<pre><code class="language-ts" data-language="ts"><span class="line" style="color:#fff">const x = 1</span></code></pre>',
    )
    expect(defaultHtml).toContain('<pre><code>const y = 2</code></pre>')
    // Script-bearing artifact never survives the 'shiki' gate.
    const evil = body([
      {
        ...elementBase(),
        type: 'code',
        language: 'js',
        children: [text('a')],
        highlightedHtml: '<span style="color:#fff">a</span><script>alert(1)</script>',
      },
    ])
    expect(lexicalCommentBodyToHtml(evil)).not.toContain('script')
    // Email mode ignores the artifact — the legacy plain form.
    const emailHtml = lexicalCommentBodyToHtml(highlighted, { mode: 'email' })
    expect(emailHtml).toContain('<pre><code data-language="ts">const x = 1</code></pre>')
    expect(emailHtml).not.toContain('shiki')
  })
})
