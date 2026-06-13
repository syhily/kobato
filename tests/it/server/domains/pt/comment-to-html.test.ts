import { describe, expect, it } from 'vitest'

import type { CommentBody } from '@/shared/pt/comment-schema'

import { commentBodyToHtml } from '@/server/domains/pt/services/comment-to-html'

describe('pt/comment-to-html — paragraph blocks', () => {
  it('renders a single text block as <p>', () => {
    const body: CommentBody = [
      {
        _type: 'block',
        _key: 'b1',
        style: 'normal',
        children: [{ _type: 'span', _key: 's1', text: 'hello', marks: [] }],
      },
    ]
    expect(commentBodyToHtml(body)).toBe('<p>hello</p>')
  })

  it('renders a blockquote style', () => {
    const body: CommentBody = [
      {
        _type: 'block',
        _key: 'b1',
        style: 'blockquote',
        children: [{ _type: 'span', _key: 's1', text: 'quoted', marks: [] }],
      },
    ]
    expect(commentBodyToHtml(body)).toBe('<blockquote>quoted</blockquote>')
  })
})

describe('pt/comment-to-html — inline marks', () => {
  it('renders strong + em + underline + strike-through decorators', () => {
    const body: CommentBody = [
      {
        _type: 'block',
        _key: 'b1',
        children: [
          { _type: 'span', _key: 's1', text: 'bold', marks: ['strong'] },
          { _type: 'span', _key: 's2', text: 'italic', marks: ['em'] },
          { _type: 'span', _key: 's3', text: 'under', marks: ['underline'] },
          { _type: 'span', _key: 's4', text: 'struck', marks: ['strike-through'] },
        ],
      },
    ]
    const html = commentBodyToHtml(body)
    expect(html).toContain('<strong>bold</strong>')
    expect(html).toContain('<em>italic</em>')
    expect(html).toContain('<u>under</u>')
    expect(html).toContain('<del>struck</del>')
  })

  it('renders inline code with double-escaping protection', () => {
    const body: CommentBody = [
      {
        _type: 'block',
        _key: 'b1',
        children: [{ _type: 'span', _key: 's1', text: '<script>', marks: ['code'] }],
      },
    ]
    expect(commentBodyToHtml(body)).toBe('<p><code>&lt;script&gt;</code></p>')
  })

  it('renders a link mark with rel + target defaults', () => {
    const body: CommentBody = [
      {
        _type: 'block',
        _key: 'b1',
        children: [
          {
            _type: 'span',
            _key: 's1',
            text: 'click',
            marks: ['link-1'],
          },
        ],
        markDefs: [{ _type: 'link', _key: 'link-1', href: 'https://example.com' }],
      },
    ]
    const html = commentBodyToHtml(body)
    expect(html).toContain('<a href="https://example.com"')
    expect(html).toContain('rel="nofollow noreferrer"')
    expect(html).toContain('target="_blank"')
    expect(html).toContain('>click</a>')
  })

  it('renders an inline math span via its TeX source', () => {
    const body: CommentBody = [
      {
        _type: 'block',
        _key: 'b1',
        children: [
          {
            _type: 'span',
            _key: 's1',
            text: 'x',
            marks: ['m-1'],
          },
        ],
        markDefs: [{ _type: 'mathInline', _key: 'm-1', tex: 'E=mc^2' }],
      },
    ]
    expect(commentBodyToHtml(body)).toBe('<p><code>$E=mc^2$</code></p>')
  })
})

describe('pt/comment-to-html — lists', () => {
  it('renders bullet list items at the same level', () => {
    const body: CommentBody = [
      {
        _type: 'block',
        _key: 'l1',
        listItem: 'bullet',
        children: [{ _type: 'span', _key: 's1', text: 'a', marks: [] }],
      },
      {
        _type: 'block',
        _key: 'l2',
        listItem: 'bullet',
        children: [{ _type: 'span', _key: 's2', text: 'b', marks: [] }],
      },
    ]
    const html = commentBodyToHtml(body)
    expect(html).toContain('<ul>')
    expect(html).toContain('<li>a</li>')
    expect(html).toContain('<li>b</li>')
    expect(html).toContain('</ul>')
  })

  it('renders ordered list items', () => {
    const body: CommentBody = [
      {
        _type: 'block',
        _key: 'l1',
        listItem: 'number',
        children: [{ _type: 'span', _key: 's1', text: 'one', marks: [] }],
      },
      {
        _type: 'block',
        _key: 'l2',
        listItem: 'number',
        children: [{ _type: 'span', _key: 's2', text: 'two', marks: [] }],
      },
    ]
    const html = commentBodyToHtml(body)
    expect(html).toContain('<ol>')
    expect(html).toContain('<li>one</li>')
    expect(html).toContain('<li>two</li>')
  })

  it('nests deeper levels under shallower ones', () => {
    const body: CommentBody = [
      {
        _type: 'block',
        _key: 'l1',
        listItem: 'bullet',
        level: 1,
        children: [{ _type: 'span', _key: 's1', text: 'a', marks: [] }],
      },
      {
        _type: 'block',
        _key: 'l2',
        listItem: 'bullet',
        level: 2,
        children: [{ _type: 'span', _key: 's2', text: 'b', marks: [] }],
      },
    ]
    const html = commentBodyToHtml(body)
    expect(html).toContain('<ul>')
    expect(html).toContain('<ul>')
    expect(html.match(/<ul>/g)!.length).toBe(2)
  })

  it('closes the open list when a paragraph follows', () => {
    const body: CommentBody = [
      {
        _type: 'block',
        _key: 'l1',
        listItem: 'bullet',
        children: [{ _type: 'span', _key: 's1', text: 'x', marks: [] }],
      },
      {
        _type: 'block',
        _key: 'p1',
        style: 'normal',
        children: [{ _type: 'span', _key: 's2', text: 'after', marks: [] }],
      },
    ]
    const html = commentBodyToHtml(body)
    expect(html).toContain('</ul>')
    expect(html).toContain('<p>after</p>')
  })
})

describe('pt/comment-to-html — special blocks', () => {
  it('renders code blocks with language data attribute', () => {
    const body: CommentBody = [{ _type: 'code', _key: 'c1', code: 'console.log("x")', language: 'javascript' }]
    const html = commentBodyToHtml(body)
    expect(html).toContain('<pre><code data-language="javascript">')
    expect(html).toContain('console.log(')
  })

  it('renders code blocks without language', () => {
    const body: CommentBody = [{ _type: 'code', _key: 'c1', code: 'plain' }]
    const html = commentBodyToHtml(body)
    expect(html).toBe('<pre><code>plain</code></pre>')
  })

  it('renders math blocks', () => {
    const body: CommentBody = [{ _type: 'mathBlock', _key: 'm1', tex: 'E=mc^2' }]
    expect(commentBodyToHtml(body)).toBe('<pre><code>$$E=mc^2$$</code></pre>')
  })
})

describe('pt/comment-to-html — escaping', () => {
  it('escapes HTML in text spans', () => {
    const body: CommentBody = [
      {
        _type: 'block',
        _key: 'b1',
        children: [{ _type: 'span', _key: 's1', text: '<img src=x>', marks: [] }],
      },
    ]
    expect(commentBodyToHtml(body)).toBe('<p>&lt;img src=x&gt;</p>')
  })

  it('escapes dangerous hrefs in link attributes', () => {
    const body: CommentBody = [
      {
        _type: 'block',
        _key: 'b1',
        children: [{ _type: 'span', _key: 's1', text: 'go', marks: ['k'] }],
        markDefs: [{ _type: 'link', _key: 'k', href: '" onmouseover="alert(1)' }],
      },
    ]
    const html = commentBodyToHtml(body)
    expect(html).not.toContain('" onmouseover="alert(1)"')
  })
})

describe('pt/comment-to-html — empty body', () => {
  it('returns an empty string for an empty body', () => {
    expect(commentBodyToHtml([])).toBe('')
  })
})
