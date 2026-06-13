import { describe, expect, it } from 'vitest'

import type { TextBlock } from '@/shared/pt/schema'

import { pmMarkToSpanMark, pushSpan, spanMarkToPmMark, textBlockToPmNode } from '@/shared/pt/bridge/nodes/text'

function textBlock(overrides: Partial<TextBlock> = {}): TextBlock {
  return {
    _type: 'block',
    _key: 'b1',
    style: 'normal',
    children: [{ _type: 'span', _key: 's1', text: 'hi' }],
    ...overrides,
  }
}

describe('shared/pt/bridge/nodes/text — textBlockToPmNode', () => {
  it('renders a normal block as a paragraph', () => {
    const node = textBlockToPmNode(textBlock(), false)
    expect(node.type).toBe('paragraph')
    expect(node.attrs).toMatchObject({ _key: 'b1' })
    expect(node.content).toEqual([{ type: 'text', text: 'hi' }])
  })

  it('renders a heading block at the matching level', () => {
    const node = textBlockToPmNode(textBlock({ style: 'h2' }), false)
    expect(node.type).toBe('heading')
    expect(node.attrs).toMatchObject({ level: 2 })
  })

  it('wraps a blockquote around a paragraph child', () => {
    const node = textBlockToPmNode(textBlock({ style: 'blockquote' }), false)
    expect(node.type).toBe('blockquote')
    expect(node.content?.[0]?.type).toBe('paragraph')
  })

  it('becomes a paragraph child when asListItemChild is true regardless of style', () => {
    const node = textBlockToPmNode(textBlock({ style: 'h2' }), true)
    expect(node.type).toBe('paragraph')
  })

  it('attaches textAlign attrs when align is set', () => {
    const node = textBlockToPmNode(textBlock({ align: 'right' }), false)
    expect(node.attrs).toMatchObject({ textAlign: 'right' })
  })

  it('omits textAlign when align is missing', () => {
    const node = textBlockToPmNode(textBlock(), false)
    expect((node.attrs as { textAlign?: string }).textAlign).toBeUndefined()
  })
})

describe('shared/pt/bridge/nodes/text — pushSpan', () => {
  it('skips spans with empty text', () => {
    const out: unknown[] = []
    pushSpan(out as never, { _type: 'span', _key: 's', text: '' }, [])
    expect(out).toHaveLength(0)
  })

  it('pushes a text node without marks when the span has no marks', () => {
    const out: unknown[] = []
    pushSpan(out as never, { _type: 'span', _key: 's', text: 'hi' }, [])
    expect(out).toEqual([{ type: 'text', text: 'hi' }])
  })

  it('pushes a text node with marks when the span has marks', () => {
    const out: unknown[] = []
    pushSpan(out as never, { _type: 'span', _key: 's', text: 'hi', marks: ['strong'] }, [])
    expect(out).toEqual([{ type: 'text', text: 'hi', marks: [{ type: 'bold' }] }])
  })
})

describe('shared/pt/bridge/nodes/text — spanMarkToPmMark', () => {
  it('maps every standard decorator', () => {
    expect(spanMarkToPmMark('strong', [])).toEqual({ type: 'bold' })
    expect(spanMarkToPmMark('em', [])).toEqual({ type: 'italic' })
    expect(spanMarkToPmMark('underline', [])).toEqual({ type: 'underline' })
    expect(spanMarkToPmMark('strike-through', [])).toEqual({ type: 'strike' })
    expect(spanMarkToPmMark('code', [])).toEqual({ type: 'code' })
  })

  it('returns an unknownMark when the markDef is missing', () => {
    expect(spanMarkToPmMark('missing', [])).toEqual({ type: 'unknownMark', attrs: { _key: 'missing' } })
  })

  it('resolves link markDefs into a link mark', () => {
    const def = { _type: 'link' as const, _key: 'lk1', href: 'https://example.com', rel: 'noopener', target: '_blank' }
    expect(spanMarkToPmMark('lk1', [def])).toEqual({
      type: 'link',
      attrs: { _key: 'lk1', href: 'https://example.com', rel: 'noopener', target: '_blank' },
    })
  })

  it('resolves mathInline markDefs', () => {
    const def = { _type: 'mathInline' as const, _key: 'm1', tex: 'a+b' }
    expect(spanMarkToPmMark('m1', [def])).toMatchObject({ type: 'mathInline', attrs: { tex: 'a+b' } })
  })

  it('resolves footnoteRef markDefs', () => {
    const def = { _type: 'footnoteRef' as const, _key: 'f1', targetKey: 'tgt', index: 1 }
    expect(spanMarkToPmMark('f1', [def])).toMatchObject({ type: 'footnoteRef', attrs: { targetKey: 'tgt', index: 1 } })
  })
})

describe('shared/pt/bridge/nodes/text — pmMarkToSpanMark', () => {
  it('round-trips decorator marks back to span decorator strings', () => {
    expect(pmMarkToSpanMark({ type: 'bold' })).toEqual({ decorator: 'strong' })
    expect(pmMarkToSpanMark({ type: 'italic' })).toEqual({ decorator: 'em' })
    expect(pmMarkToSpanMark({ type: 'code' })).toEqual({ decorator: 'code' })
  })

  it('returns null for unknown mark types', () => {
    expect(pmMarkToSpanMark({ type: 'somethingElse' } as never)).toBeNull()
  })

  it('rehydrates a link mark into a MarkDef', () => {
    const out = pmMarkToSpanMark({ type: 'link', attrs: { href: 'https://example.com', _key: 'k1' } })
    expect(out).toEqual({
      def: { _type: 'link', _key: 'k1', href: 'https://example.com', rel: undefined, target: undefined },
    })
  })

  it('synthesises a stable link _key when missing', () => {
    const a = pmMarkToSpanMark({ type: 'link', attrs: { href: 'https://a.example' } })
    const b = pmMarkToSpanMark({ type: 'link', attrs: { href: 'https://a.example' } })
    expect(a).toEqual(b)
    expect((a as { def: { _key: string } }).def._key.length).toBeGreaterThan(0)
  })

  it('rehydrates a mathInline mark into a MarkDef', () => {
    const out = pmMarkToSpanMark({ type: 'mathInline', attrs: { tex: 'a+b' } })
    expect(out).toMatchObject({ def: { _type: 'mathInline', tex: 'a+b' } })
  })

  it('rehydrates a footnoteRef mark into a MarkDef with default index 1', () => {
    const out = pmMarkToSpanMark({ type: 'footnoteRef', attrs: { targetKey: 'tgt' } })
    expect(out).toMatchObject({ def: { _type: 'footnoteRef', targetKey: 'tgt', index: 1 } })
  })
})
