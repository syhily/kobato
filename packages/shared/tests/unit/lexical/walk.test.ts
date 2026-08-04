import type { LexicalBody, LexicalNode } from '@kobato/shared/lexical/schema'

import {
  bodyToPlainText,
  collectHeadingSlotsInLexicalRenderOrder,
  collectImageStoragePaths,
  collectMusicPlayerIds,
  mapLexicalNodes,
  visitLexicalNodes,
} from '@kobato/shared/lexical/walk'
import { describe, expect, it } from 'vitest'

// Pure-JSON traversal helpers: walk / map / collect over `LexicalBody`
// in the exact render order the future renderer will use.

function elementBase(): { direction: null; format: string; indent: 0; version: 1 } {
  return { direction: null, format: '', indent: 0, version: 1 }
}

function paragraph(children: unknown[] = []) {
  return { ...elementBase(), type: 'paragraph' as const, children, textFormat: 0, textStyle: '' }
}

function text(text: string, format = 0) {
  return { detail: 0, format, mode: 'normal' as const, style: '', text, type: 'text' as const, version: 1 }
}

function heading(tag: string, children: unknown[] = []) {
  return { ...elementBase(), type: 'heading' as const, tag, children }
}

function body(children: unknown[] = []): LexicalBody {
  return { root: { ...elementBase(), type: 'root', children } } as unknown as LexicalBody
}

const IMAGE_BLOCK = { type: 'image' as const, version: 1, src: 'a', storagePath: 'images/2026/05/a.jpg' }

const MUSIC_BLOCK = { type: 'musicPlayer' as const, version: 1, playerId: '7hk2pqrxyzabc012' }

describe('shared/lexical/walk — visitLexicalNodes', () => {
  it('visits pre-order with parent / index / depth context', () => {
    const bodyBody = body([
      paragraph([text('a')]),
      {
        ...elementBase(),
        type: 'solution',
        children: [paragraph([text('b')])],
      },
    ])
    const seen: Array<[string, number, number, string | null]> = []
    visitLexicalNodes(bodyBody, (node, ctx) => {
      seen.push([node.type, ctx.depth, ctx.index, ctx.parent === null ? null : ctx.parent.type])
    })
    expect(seen).toEqual([
      ['paragraph', 1, 0, null],
      ['text', 2, 0, 'paragraph'],
      ['solution', 1, 1, null],
      ['paragraph', 2, 0, 'solution'],
      ['text', 3, 0, 'paragraph'],
    ])
  })

  it('descends through twoColumn panes', () => {
    const bodyBody = body([
      {
        ...elementBase(),
        type: 'twoColumn',
        children: [
          { ...elementBase(), type: 'twoColumnPane', side: 'left', children: [paragraph([text('L')])] },
          { ...elementBase(), type: 'twoColumnPane', side: 'right', children: [paragraph([text('R')])] },
        ],
      },
    ])
    const types: string[] = []
    visitLexicalNodes(bodyBody, (node) => {
      types.push(node.type)
    })
    expect(types).toEqual(['twoColumn', 'twoColumnPane', 'paragraph', 'text', 'twoColumnPane', 'paragraph', 'text'])
  })
})

describe('shared/lexical/walk — mapLexicalNodes', () => {
  it('maps every node exactly once and rebuilds containers', () => {
    const bodyBody = body([paragraph([text('a'), text('b')])])
    const original = bodyBody.root.children[0]
    const mapped = mapLexicalNodes(bodyBody, (node) => {
      if (node.type === 'text') {
        return { ...node, text: node.text.toUpperCase() }
      }
      return node
    })
    expect(mapped).not.toBe(bodyBody)
    expect(mapped.root.children).not.toBe(bodyBody.root.children)
    expect(mapped.root.children[0]).not.toBe(original)
    const out = mapped.root.children[0] as { children: Array<{ text: string }> }
    expect(out.children.map((c) => c.text)).toEqual(['A', 'B'])
    // Untouched leaves keep their identity.
    expect(bodyBody).not.toBe(mapped)
  })
})

describe('shared/lexical/walk — collectors', () => {
  it('collectImageStoragePaths walks containers and dedupes', () => {
    const bodyBody = body([
      IMAGE_BLOCK,
      { ...IMAGE_BLOCK, _key: undefined },
      { ...elementBase(), type: 'solution', children: [IMAGE_BLOCK] },
      {
        ...elementBase(),
        type: 'footnoteDefinition',
        index: 1,
        children: [{ type: 'image', version: 1, src: 'b', storagePath: 'images/inside-footnote.jpg' }],
      },
    ])
    expect(collectImageStoragePaths(bodyBody)).toEqual(['images/2026/05/a.jpg', 'images/inside-footnote.jpg'])
  })

  it('collectMusicPlayerIds dedupes in first-seen order', () => {
    const bodyBody = body([
      MUSIC_BLOCK,
      {
        ...elementBase(),
        type: 'twoColumn',
        children: [
          { ...elementBase(), type: 'twoColumnPane', side: 'left', children: [MUSIC_BLOCK] },
          {
            ...elementBase(),
            type: 'twoColumnPane',
            side: 'right',
            children: [{ type: 'musicPlayer', version: 1, playerId: 'second123456789' }],
          },
        ],
      },
    ])
    expect(collectMusicPlayerIds(bodyBody)).toEqual(['7hk2pqrxyzabc012', 'second123456789'])
  })
})

describe('shared/lexical/walk — bodyToPlainText', () => {
  it('projects text / hard breaks / footnote digits / link content', () => {
    const bodyBody = body([
      paragraph([text('第一行'), { type: 'linebreak', version: 1 }, text('第二行')]),
      paragraph([
        {
          ...elementBase(),
          type: 'link',
          url: 'https://example.com',
          rel: null,
          target: null,
          title: null,
          children: [text('link text')],
        },
        { type: 'footnoteRef', version: 1, targetKey: 'fn1', index: 2 },
      ]),
    ])
    const out = bodyToPlainText(bodyBody)
    expect(out).toBe('第一行\n第二行\nlink text2')
  })

  it('projects code / math / image alt / table / hr / music', () => {
    const bodyBody = body([
      { ...elementBase(), type: 'code', language: 'ts', children: [text('const a = 1')] },
      { type: 'mathBlock', version: 1, tex: 'E=mc^2' },
      { type: 'image', version: 1, src: 'a', alt: 'cover alt' },
      { type: 'image', version: 1, src: 'b' },
      {
        ...elementBase(),
        type: 'table',
        children: [
          {
            ...elementBase(),
            type: 'tablerow',
            children: [
              {
                ...elementBase(),
                type: 'tablecell',
                backgroundColor: null,
                colSpan: 1,
                headerState: 0,
                rowSpan: 1,
                children: [paragraph([text('c1')])],
              },
              {
                ...elementBase(),
                type: 'tablecell',
                backgroundColor: null,
                colSpan: 1,
                headerState: 0,
                rowSpan: 1,
                children: [paragraph([text('c2')])],
              },
            ],
          },
        ],
      },
      { type: 'horizontalrule', version: 1 },
      { type: 'musicPlayer', version: 1, playerId: '7hk2pqrxyzabc012' },
    ])
    const out = bodyToPlainText(bodyBody)
    expect(out).toContain('const a = 1')
    expect(out).toContain('E=mc^2')
    expect(out).toContain('cover alt')
    expect(out).toContain('c1c2')
    expect(out).toContain('---')
    expect(out).toContain('[Music: 7hk2pqrxyzabc012]')
    // The alt-less image contributes nothing (its `src: 'b'` must not leak).
    expect(out.split('\n')).not.toContain('b')
  })

  it('projects list items and nested lists line by line', () => {
    const bodyBody = body([
      {
        ...elementBase(),
        type: 'list',
        listType: 'bullet',
        start: 1,
        tag: 'ul',
        children: [
          {
            ...elementBase(),
            type: 'listitem',
            value: 1,
            children: [paragraph([text('outer')])],
          },
          {
            ...elementBase(),
            type: 'listitem',
            value: 2,
            children: [
              paragraph([text('outer-2')]),
              {
                ...elementBase(),
                type: 'list',
                listType: 'bullet',
                start: 1,
                tag: 'ul',
                children: [
                  {
                    ...elementBase(),
                    type: 'listitem',
                    value: 1,
                    children: [paragraph([text('nested')])],
                  },
                ],
              },
            ],
          },
        ],
      },
    ])
    expect(bodyToPlainText(bodyBody)).toBe('outer\nouter-2\nnested')
  })
})

describe('shared/lexical/walk — collectHeadingSlotsInLexicalRenderOrder', () => {
  it('walks main column, solution, twoColumn left/right, then footnote definitions', () => {
    const bodyBody = body([
      heading('h2', [text('Outer')]),
      { ...elementBase(), type: 'solution', children: [heading('h3', [text('In solution')])] },
      {
        ...elementBase(),
        type: 'twoColumn',
        children: [
          { ...elementBase(), type: 'twoColumnPane', side: 'left', children: [heading('h3', [text('Left col')])] },
          { ...elementBase(), type: 'twoColumnPane', side: 'right', children: [heading('h3', [text('Right col')])] },
        ],
      },
      { ...elementBase(), type: 'footnoteDefinition', index: 1, children: [heading('h3', [text('Note')])] },
      heading('h2', [text('After')]),
    ])
    const slots = collectHeadingSlotsInLexicalRenderOrder(bodyBody)
    expect(slots.map((s) => s.plainText)).toEqual(['Outer', 'In solution', 'Left col', 'Right col', 'After', 'Note'])
    expect(slots.map((s) => s.depth)).toEqual([2, 3, 3, 3, 2, 3])
  })

  it('skips empty headings and emits empty blockKey for standard nodes', () => {
    const bodyBody = body([heading('h2', []), heading('h3', [text('  ')])])
    expect(collectHeadingSlotsInLexicalRenderOrder(bodyBody)).toEqual([])
  })

  it('derives plain text through links and line breaks', () => {
    const bodyBody = body([
      heading('h2', [
        {
          ...elementBase(),
          type: 'link',
          url: 'https://example.com',
          rel: null,
          target: null,
          title: null,
          children: [text('linked')],
        },
        text(' heading'),
      ]),
    ])
    const slots = collectHeadingSlotsInLexicalRenderOrder(bodyBody)
    expect(slots[0]!.plainText).toBe('linked heading')
    expect(slots[0]!.blockKey).toBe('')
  })

  it('emits ptKey when a pre-canonical heading still carries one', () => {
    const bodyBody = body([
      { ...elementBase(), type: 'heading', tag: 'h2', ptKey: 'pt-heading-1', children: [text('x')] },
    ]) as unknown as LexicalBody
    const slots = collectHeadingSlotsInLexicalRenderOrder(bodyBody)
    expect(slots[0]!.blockKey).toBe('pt-heading-1')
  })
})

describe('shared/lexical/walk — mapLexicalNodes leaf identity', () => {
  it('keeps leaf identity when unchanged and maps leaves once', () => {
    const leaf = text('x')
    const bodyBody = body([paragraph([leaf])])
    let calls = 0
    const mapped = mapLexicalNodes(bodyBody, (node) => {
      calls += 1
      return node
    })
    expect(calls).toBe(2) // paragraph + text
    const outParagraph = mapped.root.children[0] as { children: LexicalNode[] }
    expect(outParagraph.children[0]).toBe(leaf)
  })
})
