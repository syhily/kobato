import { describe, expect, it } from 'vitest'

import type { PmDoc } from '@/shared/pt/bridge/types'
import type { PortableTextBody } from '@/shared/pt/schema'

import { arePortableTextBodiesEquivalent } from '@/shared/pt/bridge/canonicalize'
import { BRIDGE_NODE_REGISTRY } from '@/shared/pt/bridge/node-registry'
import { pmDocToBody } from '@/shared/pt/bridge/pm-to-pt'
import { bodyToPmDoc } from '@/shared/pt/bridge/pt-to-pm'

// Pins the two bridge policies: loud failure on unknown node types, and
// a round-trip fixture for every registry entry.

describe('pt-bridge node registry — loud unknown policy', () => {
  it('throws naming the type for an unknown top-level PM node', () => {
    const doc = {
      type: 'doc',
      content: [{ type: 'widget', attrs: { _key: 'w1' } }],
    } as unknown as PmDoc
    expect(() => pmDocToBody(doc)).toThrow(/widget/)
  })

  it('throws naming the type for an unknown mark on a text node', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          attrs: { _key: 'p1' },
          content: [{ type: 'text', text: 'hi', marks: [{ type: 'sparkle' }] }],
        },
      ],
    } as unknown as PmDoc
    expect(() => pmDocToBody(doc)).toThrow(/sparkle/)
  })

  it('throws naming the type for an unknown listItem child', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'bulletList',
          content: [
            {
              type: 'listItem',
              content: [
                { type: 'paragraph', content: [{ type: 'text', text: 'item' }] },
                { type: 'codeBlock', attrs: { _key: 'cb1' }, content: [{ type: 'text', text: 'x = 1' }] },
              ],
            },
          ],
        },
      ],
    } as unknown as PmDoc
    expect(() => pmDocToBody(doc)).toThrow(/codeBlock/)
  })

  it('still ignores stray top-level inline text (malformed doc, unchanged)', () => {
    const doc = {
      type: 'doc',
      content: [{ type: 'text', text: 'orphan' }],
    } as unknown as PmDoc
    expect(pmDocToBody(doc)).toEqual([])
  })
})

// Keyed by PM node type so the completeness check names the missing entry.
const REGISTRY_FIXTURES: ReadonlyArray<{ pmType: string; body: PortableTextBody }> = [
  {
    pmType: 'paragraph',
    body: [
      {
        _type: 'block',
        _key: 'p1',
        style: 'normal',
        children: [{ _type: 'span', _key: 's1', text: 'plain paragraph' }],
      },
    ],
  },
  {
    pmType: 'heading',
    body: [
      {
        _type: 'block',
        _key: 'h1',
        style: 'h2',
        children: [{ _type: 'span', _key: 's1', text: '标题' }],
      },
    ],
  },
  {
    pmType: 'blockquote',
    body: [
      {
        _type: 'block',
        _key: 'q1',
        style: 'blockquote',
        children: [{ _type: 'span', _key: 's1', text: 'quoted' }],
      },
    ],
  },
  {
    pmType: 'bulletList',
    body: [
      {
        _type: 'block',
        _key: 'li1',
        style: 'normal',
        listItem: 'bullet',
        level: 1,
        children: [{ _type: 'span', _key: 's1', text: 'item' }],
      },
    ],
  },
  {
    pmType: 'orderedList',
    body: [
      {
        _type: 'block',
        _key: 'li1',
        style: 'normal',
        listItem: 'number',
        level: 1,
        children: [{ _type: 'span', _key: 's1', text: 'first' }],
      },
    ],
  },
  {
    pmType: 'image',
    body: [
      {
        _type: 'image',
        _key: 'img1',
        src: 'https://cdn.example/x.jpg',
        alt: 'cover',
      },
    ],
  },
  {
    pmType: 'codeBlock',
    body: [{ _type: 'code', _key: 'c1', code: 'const x = 1', language: 'ts' }],
  },
  {
    pmType: 'horizontalRule',
    body: [{ _type: 'horizontalRule', _key: 'hr1' }],
  },
  {
    pmType: 'table',
    body: [
      {
        _type: 'table',
        _key: 't1',
        rows: [
          {
            _type: 'tableRow',
            _key: 'r1',
            cells: [
              {
                _type: 'tableCell',
                _key: 'c1',
                content: [{ _type: 'span', _key: 's1', text: 'cell' }],
              },
            ],
          },
        ],
      },
    ],
  },
  {
    pmType: 'solution',
    body: [
      {
        _type: 'solution',
        _key: 'sol1',
        children: [
          {
            _type: 'block',
            _key: 'sol1-b1',
            style: 'normal',
            children: [{ _type: 'span', _key: 's1', text: 'inner' }],
          },
        ],
      },
    ],
  },
  {
    pmType: 'twoColumn',
    body: [
      {
        _type: 'twoColumn',
        _key: 'tc1',
        left: [
          {
            _type: 'block',
            _key: 'tc1-l',
            style: 'normal',
            children: [{ _type: 'span', _key: 's1', text: 'left' }],
          },
        ],
        right: [
          {
            _type: 'block',
            _key: 'tc1-r',
            style: 'normal',
            children: [{ _type: 'span', _key: 's1', text: 'right' }],
          },
        ],
      },
    ],
  },
  {
    pmType: 'footnoteDefinition',
    body: [
      {
        _type: 'footnoteDefinition',
        _key: 'fn1',
        index: 1,
        children: [
          {
            _type: 'block',
            _key: 'fn1-b1',
            style: 'normal',
            children: [{ _type: 'span', _key: 's1', text: 'definition' }],
          },
        ],
      },
    ],
  },
  {
    // mathBlock rides the blockCard slot — no dedicated editor node.
    pmType: 'blockCard',
    body: [{ _type: 'mathBlock', _key: 'mb1', tex: 'E=mc^2' }],
  },
]

describe('pt-bridge node registry — fixture completeness', () => {
  it('has at least one round-trip fixture for every registry entry', () => {
    const missing = BRIDGE_NODE_REGISTRY.filter(
      (entry) => !REGISTRY_FIXTURES.some((fixture) => fixture.pmType === entry.pmType),
    ).map((entry) => entry.pmType)
    expect(missing).toEqual([])
  })

  for (const fixture of REGISTRY_FIXTURES) {
    it(`round-trips the ${fixture.pmType} fixture`, () => {
      const doc = bodyToPmDoc(fixture.body)
      expect(doc.content.some((node) => node.type === fixture.pmType)).toBe(true)
      expect(arePortableTextBodiesEquivalent(fixture.body, pmDocToBody(doc))).toBe(true)
    })
  }
})
