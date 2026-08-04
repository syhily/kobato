import type { LexicalCommentBody } from '@kobato/shared/lexical/comment-schema'

import {
  canonicalizeLexicalCommentBodyShape,
  areLexicalCommentBodiesEquivalent,
} from '@kobato/shared/lexical/comment-canonicalize'
import { describe, expect, it } from 'vitest'

// Canonicalize contract for comment bodies: the dialect shape is
// deterministic and idempotent. Two 0.45 runtime quirks are pinned here:
//   - a `$setBlocksType` quote carries bare inline children; canonical
//     form wraps them into paragraphs (quote keeps paragraph children)
//   - list items CANNOT hold paragraphs (ListItemNode unwraps them on
//     parse), so the paragraph alias canonicalizes back to inline
//     children — the runtime shape

function elementBase(): { direction: null; format: string; indent: 0; version: 1 } {
  return { direction: null, format: '', indent: 0, version: 1 }
}

function paragraph(children: unknown[] = []) {
  return { ...elementBase(), type: 'paragraph' as const, children, textFormat: 0, textStyle: '' }
}

function text(text: string) {
  return { detail: 0, format: 0, mode: 'normal' as const, style: '', text, type: 'text' as const, version: 1 }
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

function body(children: unknown[]): LexicalCommentBody {
  return { root: { ...elementBase(), type: 'root', children } } as LexicalCommentBody
}

describe('shared/lexical/comment-canonicalize', () => {
  it('wraps bare inline children of quotes into paragraphs', () => {
    const canonical = canonicalizeLexicalCommentBodyShape(body([quote([text('quoted')])]))
    const q = canonical.root.children[0]
    expect(q.type).toBe('quote')
    if (q.type !== 'quote') {
      return
    }
    expect(q.children.map((child) => child.type)).toEqual(['paragraph'])
    const p = q.children[0]
    expect(p.children[0]?.type).toBe('text')
    expect((p.children[0] as { text: string }).text).toBe('quoted')
    // Idempotent.
    const again = canonicalizeLexicalCommentBodyShape(canonical)
    expect(JSON.stringify(again)).toBe(JSON.stringify(canonical))
  })

  it('flattens the paragraph alias of list items to the runtime inline shape', () => {
    const canonical = canonicalizeLexicalCommentBodyShape(body([list([listItem([paragraph([text('item')])])])]))
    const l = canonical.root.children[0]
    expect(l.type).toBe('list')
    if (l.type !== 'list') {
      return
    }
    const item = l.children[0]
    expect(item.children.map((child) => child.type)).toEqual(['text'])
    // Idempotent — the canonical output re-canonicalizes to itself.
    expect(JSON.stringify(canonicalizeLexicalCommentBodyShape(canonical))).toBe(JSON.stringify(canonical))
  })

  it('keeps the runtime listitem shape and normalizes quote children deterministically', () => {
    const input = body([
      quote([text('q'), { type: 'linebreak', version: 1 }, text('more')]),
      list([listItem([text('a'), { type: 'mathInline', version: 1, tex: 'x' }])]),
    ])
    const canonical = canonicalizeLexicalCommentBodyShape(input)
    const [q, l] = canonical.root.children
    expect(q.type).toBe('quote')
    if (q.type !== 'quote') {
      return
    }
    // The whole inline run (linebreak included) wraps into one paragraph.
    expect(q.children.map((child) => child.type)).toEqual(['paragraph'])
    const p = q.children[0]
    expect(p.children.map((child) => child.type)).toEqual(['text', 'linebreak', 'text'])
    expect(l.type).toBe('list')
    if (l.type !== 'list') {
      return
    }
    expect(l.children[0]?.children.map((child) => child.type)).toEqual(['text', 'mathInline'])
  })

  it('rejects invalid bodies and stays strict on the dialect', () => {
    expect(() =>
      canonicalizeLexicalCommentBodyShape(body([{ ...elementBase(), type: 'heading', tag: 'h2', children: [] }])),
    ).toThrow()
    expect(() => canonicalizeLexicalCommentBodyShape({ not: 'a body' })).toThrow()
  })

  it('areLexicalCommentBodiesEquivalent compares canonical forms', () => {
    const a = body([list([listItem([paragraph([text('item')])])])])
    const b = body([list([listItem([text('item')])])])
    expect(areLexicalCommentBodiesEquivalent(a, b)).toBe(true)
    const c = body([list([listItem([text('other')])])])
    expect(areLexicalCommentBodiesEquivalent(a, c)).toBe(false)
  })
})
