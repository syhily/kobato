import { describe, expect, it } from 'vitest'

import type { LexicalEditorState, LexicalNodeJson } from '@/shared/lexical/schema'

import {
  crossCheckArticleConversion,
  crossCheckCommentConversion,
  htmlRoundTripCrossCheck,
} from '@/server/domains/pt/services/pt-lexical-crosscheck'
import {
  convertCommentBody,
  convertPortableTextBody,
  type NestedFragment,
} from '@/server/domains/pt/services/pt-to-lexical'
import { prerenderLexicalEditorState } from '@/server/infra/pt/lexical-prerender'
import { computeBodyProjections, renderLexicalFragmentHtml } from '@/server/infra/pt/lexical-projection'
import { commentBodySchema, type CommentBody } from '@/shared/pt/comment-schema'
import { portableTextBodySchema, type PortableTextBody } from '@/shared/pt/schema'
import { unsafeCast } from '@/shared/utils/unsafe-cast'

// The R15 zero-loss gate (E1–E5). These tests run the REAL projection
// machinery (jsdom, KaTeX, Shiki prerender) — the corpus equivalence rules
// are only meaningful against the same renderers the stored columns use.

function pt(body: unknown[]): PortableTextBody {
  return portableTextBodySchema.parse(body)
}

function span(text: string, marks?: string[]) {
  return {
    _type: 'span' as const,
    _key: Math.random().toString(36).slice(2, 10),
    text,
    ...(marks === undefined ? {} : { marks }),
  }
}

function block(children: ReturnType<typeof span>[], extra: Record<string, unknown> = {}) {
  return { _type: 'block' as const, _key: Math.random().toString(36).slice(2, 10), children, ...extra }
}

/** The executor's real fragment renderer (prerender then projection). */
async function renderFragmentPrerendered(children: LexicalNodeJson[]): Promise<string> {
  const state = unsafeCast<LexicalEditorState>({
    root: { type: 'root', version: 1, children, direction: 'ltr', format: '', indent: 0 },
  })
  await prerenderLexicalEditorState(state)
  return renderLexicalFragmentHtml(state.root.children)
}

async function convertAndCheck(body: unknown[], storedHeadings: unknown = []) {
  const ptBody = pt(body)
  const { state, fragments } = await convertPortableTextBody(ptBody, { renderFragmentHtml: renderFragmentPrerendered })
  await prerenderLexicalEditorState(state)
  const check = crossCheckArticleConversion({ ptBody, converted: state, nestedFragments: fragments, storedHeadings })
  return { state, fragments, check }
}

describe('pt/services/pt-lexical-crosscheck — E1 plain text', () => {
  it('passes a mixed body (text, decorators, breaks, code, math, hr, image alt)', async () => {
    const { check } = await convertAndCheck([
      block([span('标题段落')], { style: 'h2' }),
      block([span('普通 '), span('粗体', ['strong']), span('断\n行')]),
      { _type: 'code', _key: 'c', code: 'const x = 1', language: 'ts' },
      { _type: 'mathBlock', _key: 'm', tex: 'x^2' },
      { _type: 'horizontalRule', _key: 'h' },
      { _type: 'image', _key: 'i', src: '/storage/a.png', alt: '封面图', storagePath: 'a.png' },
      block([span('引用')], { style: 'blockquote' }),
    ])
    expect(check.failures).toEqual([])
    expect(check.ok).toBe(true)
  })

  it('excludes inline-math tex-source text on both sides', async () => {
    const { check } = await convertAndCheck([
      block([span('设 '), span('a+b', ['mi']), span(' 为实数')], {
        markDefs: [{ _type: 'mathInline', _key: 'mi', tex: 'a+b' }],
      }),
    ])
    expect(check.ok).toBe(true)
  })

  it('mirrors the Lexical nested-list join (first deeper item extends the parent line)', async () => {
    const { check } = await convertAndCheck([
      block([span('博客 LOGO：')], { listItem: 'number', level: 1 }),
      block([span('浅色'), span('：https://yufan.me/logo.svg', ['l'])], {
        listItem: 'bullet',
        level: 2,
        markDefs: [{ _type: 'link', _key: 'l', href: 'https://yufan.me/logo.svg' }],
      }),
      block([span('深色')], { listItem: 'bullet', level: 2 }),
      block([span('下一项')], { listItem: 'number', level: 1 }),
    ])
    expect(check.ok).toBe(true)
  })

  it('flags real text loss', async () => {
    const ptBody = pt([block([span('第一段')]), block([span('第二段')])])
    const { state, fragments } = await convertPortableTextBody(ptBody, {
      renderFragmentHtml: renderFragmentPrerendered,
    })
    state.root.children.pop() // simulate a lost block
    const check = crossCheckArticleConversion({
      ptBody,
      converted: state,
      nestedFragments: fragments,
      storedHeadings: [],
    })
    expect(check.ok).toBe(false)
    expect(check.failures[0]).toContain('plain-text')
  })
})

describe('pt/services/pt-lexical-crosscheck — card fragments', () => {
  it('validates solution nested content node-level (math + code + hr + text)', async () => {
    const { check } = await convertAndCheck([
      {
        _type: 'solution',
        _key: 's1',
        children: [
          block([span('解答')]),
          { _type: 'mathBlock', _key: 'm', tex: 'E=mc^2' },
          { _type: 'code', _key: 'c', code: 'print(1)', language: 'python' },
          { _type: 'horizontalRule', _key: 'h' },
        ],
      },
    ])
    expect(check.failures).toEqual([])
    expect(check.ok).toBe(true)
  })

  it('validates twoColumn panes and footnote definitions', async () => {
    const { check } = await convertAndCheck([
      { _type: 'twoColumn', _key: 'tc', left: [block([span('左')])], right: [block([span('右')])] },
      { _type: 'footnoteDefinition', _key: 'd1', index: 1, children: [block([span('注释')])] },
    ])
    expect(check.ok).toBe(true)
  })

  it('flags a card whose fragment lost a nested block', async () => {
    const ptBody = pt([{ _type: 'solution', _key: 's1', children: [block([span('解答')]), block([span('细节')])] }])
    const { state, fragments } = await convertPortableTextBody(ptBody, {
      renderFragmentHtml: renderFragmentPrerendered,
    })
    const damaged: NestedFragment[] = fragments.map((f) => {
      const copy: NestedFragment = {
        container: f.container,
        key: f.key,
        ptBlocks: f.ptBlocks,
        nodes: f.nodes.slice(0, 1),
      }
      if (f.side !== undefined) {
        copy.side = f.side
      }
      return copy
    })
    const check = crossCheckArticleConversion({
      ptBody,
      converted: state,
      nestedFragments: damaged,
      storedHeadings: [],
    })
    expect(check.ok).toBe(false)
    expect(check.failures[0]).toContain('card-fragment solution')
  })
})

describe('pt/services/pt-lexical-crosscheck — E2 headings + E3 images', () => {
  it('passes depth/text sequence and counts stored-slug policy changes', async () => {
    const { check } = await convertAndCheck(
      [block([span('你好 世界')], { style: 'h2' }), block([span('Sub')], { style: 'h3' })],
      // Stored slugs from the retired github-slugger/pinyin policy differ for CJK.
      [
        { depth: 2, text: '你好 世界', slug: 'ni-hao-shi-jie' },
        { depth: 3, text: 'Sub', slug: 'sub' },
      ],
    )
    expect(check.ok).toBe(true)
    expect(check.slugPolicyChanges).toBe(1)
  })

  it('flags a heading depth flip', async () => {
    const ptBody = pt([block([span('标题')], { style: 'h2' })])
    const { state, fragments } = await convertPortableTextBody(ptBody, {
      renderFragmentHtml: renderFragmentPrerendered,
    })
    unsafeCast<{ tag: string }>(state.root.children[0]).tag = 'h3'
    const check = crossCheckArticleConversion({
      ptBody,
      converted: state,
      nestedFragments: fragments,
      storedHeadings: [],
    })
    expect(check.ok).toBe(false)
    expect(check.failures[0]).toContain('headings')
  })

  it('compares top-level image storage paths and reports card-nested ones', async () => {
    const { check } = await convertAndCheck([
      { _type: 'image', _key: 'i1', src: '/storage/a.png', storagePath: 'posts/a.png' },
      { _type: 'image', _key: 'i2', src: '/storage/b.png', storagePath: 'posts/b.png' },
      {
        _type: 'twoColumn',
        _key: 'tc',
        left: [{ _type: 'image', _key: 'i3', src: '/storage/c.png', storagePath: 'posts/c.png' }],
        right: [],
      },
    ])
    expect(check.ok).toBe(true)
    expect(check.nestedImageStoragePaths).toEqual(['posts/c.png'])
  })

  it('flags a lost top-level image', async () => {
    const ptBody = pt([{ _type: 'image', _key: 'i1', src: '/storage/a.png', storagePath: 'posts/a.png' }])
    const { state, fragments } = await convertPortableTextBody(ptBody, {
      renderFragmentHtml: renderFragmentPrerendered,
    })
    state.root.children.pop()
    const check = crossCheckArticleConversion({
      ptBody,
      converted: state,
      nestedFragments: fragments,
      storedHeadings: [],
    })
    expect(check.ok).toBe(false)
    expect(check.failures[0]).toContain('image-sources')
  })
})

describe('pt/services/pt-lexical-crosscheck — E4 comments', () => {
  function comment(body: unknown[]): CommentBody {
    return commentBodySchema.parse(body)
  }

  it('passes a restricted comment body', () => {
    const ptBody = comment([
      block([span('写得'), span('不错', ['strong'])]),
      block([span('引用')], { style: 'blockquote' }),
      block([span('项')], { listItem: 'bullet', level: 1 }),
      { _type: 'code', _key: 'c', code: 'x()', language: 'ts' },
      { _type: 'mathBlock', _key: 'm', tex: 'y=1' },
      block([span('链', ['k'])], { markDefs: [{ _type: 'link', _key: 'k', href: 'https://example.com' }] }),
    ])
    const { state } = convertCommentBody(ptBody)
    const check = crossCheckCommentConversion(ptBody, unsafeCast<LexicalEditorState>(state))
    expect(check.ok).toBe(true)
  })

  it('flags comment text loss', () => {
    const ptBody = comment([block([span('保留')]), block([span('丢失')])])
    const { state } = convertCommentBody(ptBody)
    state.root.children.pop()
    const check = crossCheckCommentConversion(ptBody, unsafeCast<LexicalEditorState>(state))
    expect(check.ok).toBe(false)
  })
})

describe('pt/services/pt-lexical-crosscheck — E5 round-trip', () => {
  it('round-trips a math/code/table body without warnings (math excised for the importer)', async () => {
    const { state } = await convertAndCheck([
      block([span('设 '), span('a+b', ['mi']), span(' 为实数')], {
        markDefs: [{ _type: 'mathInline', _key: 'mi', tex: 'a+b' }],
      }),
      { _type: 'mathBlock', _key: 'm', tex: 'x^2' },
      { _type: 'code', _key: 'c', code: 'const a = 1', language: 'ts' },
      block([span('右对齐')], { align: 'right' }),
    ])
    const projections = await computeBodyProjections(state)
    const warnings = await htmlRoundTripCrossCheck(state, projections.bodyHtml)
    expect(warnings).toEqual([])
  })
})
