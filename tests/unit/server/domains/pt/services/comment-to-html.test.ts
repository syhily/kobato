import { describe, expect, it } from 'vitest'

import type { CommentBlock, CommentBody } from '@/shared/pt/comment-schema'

import { commentBodyToHtml } from '@/server/domains/pt/services/comment-to-html'

// Characterization test: pins the exact byte output of the comment-dialect
// PortableText→HTML renderer (transactional email bodies). Every case was
// captured against the original hand-rolled renderer; cases whose output
// legitimately changed with the `@portabletext/to-html` reimplementation are
// marked with a `note` explaining the difference.

interface Case {
  name: string
  body: CommentBody
  expected: string
  note?: string
}

const span = (_key: string, text: string, marks?: string[]) => ({
  _type: 'span' as const,
  _key,
  text,
  ...(marks === undefined ? {} : { marks }),
})

const textBlock = (
  _key: string,
  children: ReturnType<typeof span>[],
  extra?: {
    style?: 'normal' | 'blockquote'
    listItem?: 'bullet' | 'number'
    level?: number
    markDefs?: (
      | { _type: 'link'; _key: string; href: string; rel?: string; target?: string }
      | { _type: 'mathInline'; _key: string; tex: string }
    )[]
  },
): CommentBlock => ({
  _type: 'block',
  _key,
  children,
  ...extra,
})

const cases: Case[] = [
  // --- Blocks -------------------------------------------------------------
  {
    name: 'plain paragraph',
    body: [textBlock('b1', [span('s1', 'hello', [])], { style: 'normal' })],
    expected: '<p>hello</p>',
  },
  {
    name: 'blockquote',
    body: [textBlock('b1', [span('s1', 'quoted', [])], { style: 'blockquote' })],
    expected: '<blockquote>quoted</blockquote>',
  },
  {
    name: 'block without style renders as <p>',
    body: [textBlock('b1', [span('s1', 'plain', [])])],
    expected: '<p>plain</p>',
  },
  {
    name: 'block with empty children',
    body: [textBlock('b1', [])],
    expected: '<p></p>',
  },
  {
    name: 'block with empty-text span',
    body: [textBlock('b1', [span('s1', '')])],
    expected: '<p></p>',
  },
  {
    name: 'multiple blocks join with newline',
    body: [textBlock('b1', [span('s1', 'one', [])]), textBlock('b2', [span('s2', 'two', [])], { style: 'blockquote' })],
    expected: '<p>one</p>\n<blockquote>two</blockquote>',
  },
  {
    name: 'span without marks field',
    body: [textBlock('b1', [span('s1', 'nomarks')])],
    expected: '<p>nomarks</p>',
  },

  // --- Decorators ---------------------------------------------------------
  {
    name: 'strong',
    body: [textBlock('b1', [span('s1', 'bold', ['strong'])])],
    expected: '<p><strong>bold</strong></p>',
  },
  {
    name: 'em',
    body: [textBlock('b1', [span('s1', 'italic', ['em'])])],
    expected: '<p><em>italic</em></p>',
  },
  {
    name: 'underline',
    body: [textBlock('b1', [span('s1', 'under', ['underline'])])],
    expected: '<p><u>under</u></p>',
  },
  {
    name: 'strike-through',
    body: [textBlock('b1', [span('s1', 'struck', ['strike-through'])])],
    expected: '<p><del>struck</del></p>',
  },
  {
    name: 'inline code',
    body: [textBlock('b1', [span('s1', 'x', ['code'])])],
    expected: '<p><code>x</code></p>',
  },
  {
    name: 'strong + em nesting',
    body: [textBlock('b1', [span('s1', 't', ['strong', 'em'])])],
    expected: '<p><strong><em>t</em></strong></p>',
  },
  {
    name: 'em + strong (declared in reverse order)',
    body: [textBlock('b1', [span('s1', 't', ['em', 'strong'])])],
    expected: '<p><strong><em>t</em></strong></p>',
  },
  {
    name: 'em + strike-through',
    body: [textBlock('b1', [span('s1', 't', ['em', 'strike-through'])])],
    expected: '<p><em><del>t</del></em></p>',
  },
  {
    name: 'underline + strike-through',
    body: [textBlock('b1', [span('s1', 't', ['underline', 'strike-through'])])],
    expected: '<p><u><del>t</del></u></p>',
  },
  {
    name: 'strong + underline nesting order',
    body: [textBlock('b1', [span('s1', 't', ['strong', 'underline'])])],
    expected: '<p><strong><u>t</u></strong></p>',
    note: 'Delta vs the hand-rolled renderer (<u><strong>t</strong></u>): @portabletext/toolkit nests decorators in its canonical order (strong, em, code, underline, strike-through). Semantically identical markup.',
  },
  {
    name: 'all typography decorators at once',
    body: [textBlock('b1', [span('s1', 't', ['strong', 'em', 'underline', 'strike-through'])])],
    expected: '<p><strong><em><u><del>t</del></u></em></strong></p>',
    note: 'Delta vs the hand-rolled renderer (<u><strong><em><del>t</del></em></strong></u>): canonical toolkit decorator order. Semantically identical markup.',
  },
  {
    name: 'code wins over other decorators',
    body: [textBlock('b1', [span('s1', 't', ['code', 'strong'])])],
    expected: '<p><code>t</code></p>',
  },
  {
    name: 'code wins over underline',
    body: [textBlock('b1', [span('s1', 't', ['code', 'underline'])])],
    expected: '<p><code>t</code></p>',
  },
  {
    name: 'code + link annotation keeps the link',
    body: [
      textBlock('b1', [span('s1', 't', ['code', 'k1'])], {
        markDefs: [{ _type: 'link', _key: 'k1', href: 'https://example.com' }],
      }),
    ],
    expected: '<p><a href="https://example.com" rel="nofollow noreferrer" target="_blank"><code>t</code></a></p>',
  },
  {
    name: 'adjacent spans sharing a decorator merge into one element',
    body: [textBlock('b1', [span('s1', 'a', ['strong']), span('s2', 'b', ['strong'])])],
    expected: '<p><strong>ab</strong></p>',
    note: 'Delta vs the hand-rolled renderer (<strong>a</strong><strong>b</strong>): buildMarksTree merges adjacent spans sharing marks — the toolkit’s documented purpose. Semantically identical markup.',
  },
  {
    name: 'unknown mark key without markDef is ignored',
    body: [textBlock('b1', [span('s1', 't', ['zzz'])])],
    expected: '<p>t</p>',
  },

  // --- Links ---------------------------------------------------------------
  {
    name: 'link with default rel/target',
    body: [
      textBlock('b1', [span('s1', 'click', ['k1'])], {
        markDefs: [{ _type: 'link', _key: 'k1', href: 'https://example.com' }],
      }),
    ],
    expected: '<p><a href="https://example.com" rel="nofollow noreferrer" target="_blank">click</a></p>',
  },
  {
    name: 'link with explicit rel/target',
    body: [
      textBlock('b1', [span('s1', 'click', ['k1'])], {
        markDefs: [{ _type: 'link', _key: 'k1', href: 'https://example.com', rel: 'ugc', target: '_self' }],
      }),
    ],
    expected: '<p><a href="https://example.com" rel="ugc" target="_self">click</a></p>',
  },
  {
    name: 'link wraps decorated text',
    body: [
      textBlock('b1', [span('s1', 't', ['strong', 'k1'])], {
        markDefs: [{ _type: 'link', _key: 'k1', href: 'https://example.com' }],
      }),
    ],
    expected: '<p><a href="https://example.com" rel="nofollow noreferrer" target="_blank"><strong>t</strong></a></p>',
  },
  {
    name: 'link href quote injection is escaped',
    body: [
      textBlock('b1', [span('s1', 'go', ['k'])], {
        markDefs: [{ _type: 'link', _key: 'k', href: '" onmouseover="alert(1)' }],
      }),
    ],
    expected: '<p><a href="&quot; onmouseover=&quot;alert(1)" rel="nofollow noreferrer" target="_blank">go</a></p>',
  },

  // --- Math ----------------------------------------------------------------
  {
    name: 'mathInline renders TeX in <code>',
    body: [
      textBlock('b1', [span('s1', 'x', ['m1'])], {
        markDefs: [{ _type: 'mathInline', _key: 'm1', tex: 'E=mc^2' }],
      }),
    ],
    expected: '<p><code>$E=mc^2$</code></p>',
  },
  {
    name: 'mathInline escapes TeX',
    body: [
      textBlock('b1', [span('s1', 'x', ['m1'])], {
        markDefs: [{ _type: 'mathInline', _key: 'm1', tex: 'a < b & "c"' }],
      }),
    ],
    expected: '<p><code>$a &lt; b &amp; &quot;c&quot;$</code></p>',
  },
  {
    name: 'mathInline wins over decorators',
    body: [
      textBlock('b1', [span('s1', 'x', ['m1', 'strong'])], {
        markDefs: [{ _type: 'mathInline', _key: 'm1', tex: 'y' }],
      }),
    ],
    expected: '<p><code>$y$</code></p>',
  },
  {
    name: 'mathInline wins over a link on the same span',
    body: [
      textBlock('b1', [span('s1', 'x', ['m1', 'k1'])], {
        markDefs: [
          { _type: 'mathInline', _key: 'm1', tex: 'y' },
          { _type: 'link', _key: 'k1', href: 'https://example.com' },
        ],
      }),
    ],
    expected: '<p><code>$y$</code></p>',
  },
  {
    name: 'mathBlock',
    body: [{ _type: 'mathBlock', _key: 'm1', tex: 'E=mc^2' }],
    expected: '<pre><code>$$E=mc^2$$</code></pre>',
  },
  {
    name: 'mathBlock escapes TeX',
    body: [{ _type: 'mathBlock', _key: 'm1', tex: 'a < b & "c"' }],
    expected: '<pre><code>$$a &lt; b &amp; &quot;c&quot;$$</code></pre>',
  },

  // --- Code blocks -----------------------------------------------------------
  {
    name: 'code block with language',
    body: [{ _type: 'code', _key: 'c1', code: 'console.log("x")', language: 'javascript' }],
    expected: '<pre><code data-language="javascript">console.log(&quot;x&quot;)</code></pre>',
  },
  {
    name: 'code block without language',
    body: [{ _type: 'code', _key: 'c1', code: 'plain' }],
    expected: '<pre><code>plain</code></pre>',
  },
  {
    name: 'code block escapes HTML in code',
    body: [{ _type: 'code', _key: 'c1', code: '<script>alert(1)</script>' }],
    expected: '<pre><code>&lt;script&gt;alert(1)&lt;/script&gt;</code></pre>',
  },
  {
    name: 'code block escapes language attribute',
    body: [{ _type: 'code', _key: 'c1', code: 'x', language: 'js"><script>' }],
    expected: '<pre><code data-language="js&quot;&gt;&lt;script&gt;">x</code></pre>',
  },

  // --- Lists -----------------------------------------------------------------
  {
    name: 'bullet list, same level',
    body: [
      textBlock('l1', [span('s1', 'a', [])], { listItem: 'bullet' }),
      textBlock('l2', [span('s2', 'b', [])], { listItem: 'bullet' }),
    ],
    expected: '<ul>\n<li>a</li>\n<li>b</li>\n</ul>',
  },
  {
    name: 'ordered list, same level',
    body: [
      textBlock('l1', [span('s1', 'one', [])], { listItem: 'number' }),
      textBlock('l2', [span('s2', 'two', [])], { listItem: 'number' }),
    ],
    expected: '<ol>\n<li>one</li>\n<li>two</li>\n</ol>',
  },
  {
    name: 'nested bullet list',
    body: [
      textBlock('l1', [span('s1', 'a', [])], { listItem: 'bullet', level: 1 }),
      textBlock('l2', [span('s2', 'b', [])], { listItem: 'bullet', level: 2 }),
    ],
    expected: '<ul>\n<li>a<ul>\n<li>b</li>\n</ul></li>\n</ul>',
    note: 'Delta vs the hand-rolled renderer (<ul><li>a</li><ul>… sibling nesting): the toolkit follows the PortableText spec and nests child lists INSIDE the parent <li> — the semantically correct HTML.',
  },
  {
    name: 'level jump 1 → 3 wraps intermediate levels in placeholder <li>',
    body: [
      textBlock('l1', [span('s1', 'a', [])], { listItem: 'bullet', level: 1 }),
      textBlock('l2', [span('s2', 'b', [])], { listItem: 'bullet', level: 3 }),
    ],
    expected: '<ul>\n<li>a<ul>\n<li><ul>\n<li>b</li>\n</ul></li>\n</ul></li>\n</ul>',
    note: 'Delta vs the hand-rolled renderer (empty sibling <ul><ul>…): the toolkit fills skipped levels with empty placeholder <li> elements per its html nest mode.',
  },
  {
    name: 'bullet → number flip at the top level',
    body: [
      textBlock('l1', [span('s1', 'a', [])], { listItem: 'bullet', level: 1 }),
      textBlock('l2', [span('s2', 'b', [])], { listItem: 'number', level: 1 }),
    ],
    expected: '<ul>\n<li>a</li>\n</ul>\n<ol>\n<li>b</li>\n</ol>',
  },
  {
    name: 'bullet → number flip at depth',
    body: [
      textBlock('l1', [span('s1', 'a', [])], { listItem: 'bullet', level: 1 }),
      textBlock('l2', [span('s2', 'b', [])], { listItem: 'bullet', level: 2 }),
      textBlock('l3', [span('s3', 'c', [])], { listItem: 'number', level: 2 }),
    ],
    expected: '<ul>\n<li>a<ul>\n<li>b</li>\n</ul></li>\n</ul><ol>\n<li><ol>\n<li>c</li>\n</ol></li>\n</ol>',
    note: 'Delta vs the hand-rolled renderer (flat sibling lists under one <ul>): per the PortableText spec the flipped list cannot rejoin the level-2 slot, so the toolkit starts a new top-level <ol> and re-descends to level 2 with a placeholder <li>.',
  },
  {
    name: 'deeper list, then back to the outer level',
    body: [
      textBlock('l1', [span('s1', 'a', [])], { listItem: 'bullet', level: 1 }),
      textBlock('l2', [span('s2', 'b', [])], { listItem: 'number', level: 2 }),
      textBlock('l3', [span('s3', 'c', [])], { listItem: 'bullet', level: 1 }),
    ],
    expected: '<ul>\n<li>a<ol>\n<li>b</li>\n</ol></li>\n<li>c</li>\n</ul>',
    note: 'Delta vs the hand-rolled renderer (<li>a</li><ol>… sibling nesting): the toolkit nests the deeper list INSIDE the parent <li> per the PortableText spec.',
  },
  {
    name: 'list closes when a paragraph follows',
    body: [
      textBlock('l1', [span('s1', 'x', [])], { listItem: 'bullet' }),
      textBlock('p1', [span('s2', 'after', [])], { style: 'normal' }),
    ],
    expected: '<ul>\n<li>x</li>\n</ul>\n<p>after</p>',
  },
  {
    name: 'list closes when a code block follows',
    body: [textBlock('l1', [span('s1', 'x', [])], { listItem: 'bullet' }), { _type: 'code', _key: 'c1', code: 'y' }],
    expected: '<ul>\n<li>x</li>\n</ul>\n<pre><code>y</code></pre>',
  },
  {
    name: 'list item with inline marks',
    body: [
      textBlock('l1', [span('s1', 'a', ['strong'])], { listItem: 'bullet' }),
      textBlock('l2', [span('s2', 'b', [])], { listItem: 'bullet' }),
    ],
    expected: '<ul>\n<li><strong>a</strong></li>\n<li>b</li>\n</ul>',
  },
  {
    name: 'blockquote style on a list item is ignored',
    body: [textBlock('l1', [span('s1', 'a', [])], { listItem: 'bullet', style: 'blockquote' })],
    expected: '<ul>\n<li>a</li>\n</ul>',
  },
  {
    name: 'two separate list runs join with newline',
    body: [
      textBlock('l1', [span('s1', 'a', [])], { listItem: 'bullet' }),
      textBlock('p1', [span('s2', 'mid', [])]),
      textBlock('l2', [span('s3', 'b', [])], { listItem: 'number' }),
    ],
    expected: '<ul>\n<li>a</li>\n</ul>\n<p>mid</p>\n<ol>\n<li>b</li>\n</ol>',
  },

  // --- Escaping ---------------------------------------------------------------
  {
    name: 'escapes HTML in text',
    body: [textBlock('b1', [span('s1', '<img src=x>', [])])],
    expected: '<p>&lt;img src=x&gt;</p>',
  },
  {
    name: 'escapes ampersand and double quotes, leaves single quotes',
    body: [textBlock('b1', [span('s1', `a & "b" < 'c'`, [])])],
    expected: `<p>a &amp; &quot;b&quot; &lt; 'c'</p>`,
  },
  {
    name: 'preserves consecutive spaces literally',
    body: [textBlock('b1', [span('s1', 'a  b', [])])],
    expected: '<p>a  b</p>',
  },
  {
    name: 'preserves newlines inside span text literally',
    body: [textBlock('b1', [span('s1', 'a\nb', [])])],
    expected: '<p>a\nb</p>',
  },
  {
    name: 'escapes inside inline code',
    body: [textBlock('b1', [span('s1', '<script>', ['code'])])],
    expected: '<p><code>&lt;script&gt;</code></p>',
  },
  {
    name: 'empty body renders empty string',
    body: [],
    expected: '',
  },
]

describe('pt/comment-to-html — characterization', () => {
  for (const { name, body, expected, note } of cases) {
    it(name, () => {
      void note
      expect(commentBodyToHtml(body)).toBe(expected)
    })
  }
})
