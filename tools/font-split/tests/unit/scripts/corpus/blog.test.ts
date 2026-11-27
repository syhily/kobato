import { blogFixture, pageCodepoints, readPages } from '@kobato/font-split/scripts/corpus/blog'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, describe, expect, it } from 'vitest'

const projected = (html: string): string => String.fromCodePoint(...pageCodepoints(html))
const roots: string[] = []

const SCHEMA = `
CREATE TABLE post (
  slug TEXT, published_at INTEGER, deleted_at INTEGER, published INTEGER, published_revision_id INTEGER
);
CREATE TABLE page (
  slug TEXT, published_at INTEGER, deleted_at INTEGER, published INTEGER, published_revision_id INTEGER
);
CREATE TABLE content (id INTEGER PRIMARY KEY, body_html TEXT);
`

interface Seed {
  slug: string
  publishedAt: number
  deletedAt: number | null
  published: number
  revision: number
}

function database(rows: readonly Seed[]): string {
  const root = mkdtempSync(join(tmpdir(), 'kobato-blog-pages-'))
  roots.push(root)
  const file = join(root, 'kobato.db')
  const db = new DatabaseSync(file)
  db.exec(SCHEMA)
  const post = db.prepare('INSERT INTO post VALUES (?, ?, ?, ?, ?)')
  for (const { slug, publishedAt, deletedAt, published, revision } of rows) {
    db.prepare('INSERT INTO content (id, body_html) VALUES (?, ?)').run(revision, `<p>${slug}</p>`)
    post.run(slug, publishedAt, deletedAt, published, revision)
  }
  db.close()
  return file
}

describe('pageCodepoints', () => {
  it('skips code, math, svg and form controls', () => {
    const html =
      '<p>甲<code>xyz</code>乙<pre>abc</pre><math><mi>Q</mi>Q</math><svg><rect/></svg><select><option>opt</option></select>丙</p>'
    expect(projected(html)).toBe('丙乙甲')
  })

  it('counts ordered-list markers but not bullets', () => {
    expect(projected('<ol><li>甲</li><li>乙</li></ol><ul><li>丙</li></ul>')).toBe('.12丙乙甲')
    expect(projected('<ol><li><p>甲</p></li></ol>')).toBe('.1甲')
  })

  it('decodes entities and rejects unknown names', () => {
    expect(projected('a&amp;b&#x4E2D;&#20013;&nbsp;')).toBe('&ab\u{a0}中')
    expect(projected('AT&T 1 < 2')).toBe(' &12<AT')
    expect(() => pageCodepoints('a&copy;b')).toThrow(/unsupported HTML entity: &copy;/)
  })

  it('turns out-of-range numeric references into the replacement character', () => {
    expect(projected('&#x110000;&#xD800; &#0;x')).toBe(' x\u{fffd}')
  })

  it('ignores comments and attributes', () => {
    const html = '<!-- c --><img alt="a > b" src="x">甲<br>乙<p title="丙">丁</p>'
    expect(projected(html)).toBe('丁乙甲')
  })

  it('rejects a mismatched end tag', () => {
    expect(() => pageCodepoints('<p>甲</div>')).toThrow(/mismatched end tag <\/div> \(open: p\)/)
    expect(() => pageCodepoints('甲</p>')).toThrow(/mismatched end tag <\/p> \(open: none\)/)
  })
})

describe('blogFixture', () => {
  it('writes one sorted codepoint set per row under the provenance header', () => {
    const rows: Array<{ slug: string; publishedAt: number; html: string }> = [
      { slug: 'b', publishedAt: 2, html: '<p>乙甲</p>' },
      { slug: 'a', publishedAt: 1, html: 'a a' },
    ]
    const content = blogFixture(rows, new Date(2026, 10, 25))
    const lines = content.split('\n')
    expect(lines.slice(0, 6)).toEqual([
      '# Production blog pages for the page-cost harness (tests/page_cost.rs).',
      '# 2 published posts and pages in publish order, one per line: sorted comma-separated uppercase hex codepoints.',
      '# Scope: the characters the public theme renders in the post font slot — saved body text outside pre/code,',
      '#   form controls, svg and MathML, plus ordered-list markers. Codepoint sets only; no text is stored.',
      '# Source: a Kobato content database (the published revision of every live post and page), snapshot 2026-11-25.',
      '# Generator: pnpm --filter @kobato/font-split run fixture:blog <kobato.db> <this file>',
    ])
    expect(lines.slice(6)).toEqual(['4E59,7532', '20,61', ''])
  })
})

describe('readPages', () => {
  afterEach(() => {
    for (const root of roots.splice(0)) {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('reads the published, undeleted posts and pages in publish order', () => {
    const file = database([
      { slug: 'late-post', publishedAt: 2000, deletedAt: null, published: 1, revision: 1 },
      { slug: 'draft', publishedAt: 3000, deletedAt: null, published: 0, revision: 2 },
      { slug: 'deleted', publishedAt: 1000, deletedAt: 5, published: 1, revision: 3 },
      { slug: 'early-page', publishedAt: 1000, deletedAt: null, published: 1, revision: 4 },
      { slug: 'late-page', publishedAt: 2000, deletedAt: null, published: 1, revision: 5 },
    ])
    expect(readPages(file).map((row) => [row.slug, row.publishedAt])).toEqual([
      ['early-page', 1000],
      ['late-page', 2000],
      ['late-post', 2000],
    ])
    expect(readPages(file)[0]?.html).toBe('<p>early-page</p>')
  })

  it('rejects a row whose shape it does not model', () => {
    const file = database([{ slug: 'ok', publishedAt: 1000, deletedAt: null, published: 1, revision: 1 }])
    const db = new DatabaseSync(file)
    db.prepare('INSERT INTO post VALUES (?, ?, ?, ?, ?)').run(null, 2000, null, 1, 1)
    db.close()
    expect(() => readPages(file)).toThrow(/unexpected content row shape/)
  })
})
