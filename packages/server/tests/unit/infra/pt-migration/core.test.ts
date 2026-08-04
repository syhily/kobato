import type { PtRowOutcome } from '@kobato/server/infra/pt-migration/core'
import type { LexicalCommentBody } from '@kobato/shared/lexical/comment-schema'
import type { LexicalBody } from '@kobato/shared/lexical/schema'

import {
  convertPtRow,
  gateConverted,
  isPortableTextShape,
  processPtRow,
  spotRender,
  truncateError,
} from '@kobato/server/infra/pt-migration/core'
import { verifyBodySanity } from '@kobato/server/infra/pt-migration/migrate'
import { parseLexicalCommentBody } from '@kobato/shared/lexical/comment-schema'
import { parseLexicalBody } from '@kobato/shared/lexical/schema'
import { unsafeCast } from '@kobato/shared/utils/unsafe-cast'
import { describe, expect, it } from 'vitest'

// Unit tests for the per-row PT → Lexical pipeline (`core.ts`) and the
// verify sanity assertions (`migrate.ts::verifyBodySanity`). The
// historical-shape coverage lives in `corpus.test.ts`; these pin the
// pipeline mechanics and the error classification.

const span = (key: string, text: string, marks?: string[]) => ({
  _type: 'span',
  _key: key,
  text,
  ...(marks ? { marks } : {}),
})
const block = (key: string, style: string, children: unknown[], extra: Record<string, unknown> = {}) => ({
  _type: 'block',
  _key: key,
  style,
  children,
  ...extra,
})

const richContentBody = [
  block('h1', 'h2', [span('s1', '标题')]),
  block('p1', 'normal', [span('s2', '正文 '), span('s3', '加粗', ['strong'])]),
  block('li1', 'normal', [span('s4', '列表项')], { listItem: 'bullet', level: 1 }),
]

const validCommentBody = [
  block('c1', 'normal', [span('cs1', '评论'), span('cs2', '重点', ['strong'])]),
  block('c2', 'blockquote', [span('cs3', '引用')]),
]

const lexicalBody = {
  root: {
    direction: null,
    format: '',
    indent: 0,
    type: 'root',
    version: 1,
    children: [
      {
        direction: null,
        format: '',
        indent: 0,
        type: 'paragraph',
        textFormat: 0,
        textStyle: '',
        children: [{ detail: 0, format: 0, mode: 'normal', style: '', text: '已是 Lexical', type: 'text', version: 1 }],
        version: 1,
      },
    ],
  },
}

/** Narrow `outcome` to the migrated variant (vitest's `expect` is not a type guard). */
function expectMigrated(outcome: PtRowOutcome): asserts outcome is Extract<PtRowOutcome, { status: 'migrated' }> {
  expect(outcome.status).toBe('migrated')
}

/** Narrow `outcome` to the error variant. */
function expectError(outcome: PtRowOutcome): asserts outcome is Extract<PtRowOutcome, { status: 'error' }> {
  expect(outcome.status).toBe('error')
}

function firstParagraph(body: LexicalBody): { text: string } {
  const first = body.root.children[0]
  if (first.type !== 'paragraph') {
    throw new Error(`expected a paragraph, got ${first.type}`)
  }
  return { text: JSON.stringify(first.children) }
}

describe('processPtRow — pipeline mechanics', () => {
  it('migrates a valid content body through the gate', () => {
    const outcome = processPtRow('content', 1, JSON.stringify(richContentBody))
    expectMigrated(outcome)
    expect(outcome.beforeBytes).toBeGreaterThan(0)
    expect(outcome.afterBytes).toBeGreaterThan(0)
    const converted = parseLexicalBody(JSON.parse(outcome.converted) as unknown)
    expect(() => spotRender(converted)).not.toThrow()
  })

  it('migrates a valid comment body through the comment gate', () => {
    const outcome = processPtRow('comment', 2, JSON.stringify(validCommentBody))
    expectMigrated(outcome)
    const converted = parseLexicalCommentBody(JSON.parse(outcome.converted) as unknown)
    expect(converted.root.children.length).toBeGreaterThan(0)
  })

  it('maps an empty PT array to the single-empty-paragraph document', () => {
    const outcome = processPtRow('content', 3, '[]')
    expectMigrated(outcome)
    const converted = parseLexicalBody(JSON.parse(outcome.converted) as unknown)
    expect(converted.root.children).toHaveLength(1)
    expect(converted.root.children[0].type).toBe('paragraph')
    const first = converted.root.children[0]
    if (first.type !== 'paragraph') {
      throw new Error(`expected a paragraph, got ${first.type}`)
    }
    expect(first.children).toHaveLength(0)
  })

  it('skips bodies that are already Lexical (idempotence)', () => {
    const outcome = processPtRow('content', 4, JSON.stringify(lexicalBody))
    expect(outcome.status).toBe('skipped-lexical')
  })

  it('classifies invalid JSON as invalid-json', () => {
    const outcome = processPtRow('content', 5, '{not json')
    expectError(outcome)
    expect(outcome.error).toBe('invalid-json')
  })

  it('classifies unknown _type as a schema error with a reasonable message', () => {
    const outcome = processPtRow('content', 6, JSON.stringify([{ _type: 'widget', _key: 'w1' }]))
    expectError(outcome)
    expect(outcome.error).toMatch(/invalid/i)
  })

  it('classifies an unsafe link href as an error', () => {
    const body = [
      block('p1', 'normal', [span('s1', '链接', ['l1'])], {
        markDefs: [{ _type: 'link', _key: 'l1', href: 'javascript:alert(1)' }],
      }),
    ]
    const outcome = processPtRow('content', 7, JSON.stringify(body))
    expectError(outcome)
    expect(outcome.error).toMatch(/href|url|javascript/i)
  })

  it('rejects a comment body carrying a disallowed node', () => {
    const body = [{ _type: 'image', _key: 'i1', src: '/x.png' }]
    const outcome = processPtRow('comment', 8, JSON.stringify(body))
    expectError(outcome)
  })

  it('keeps spans without marks and with empty marks', () => {
    const body = [
      {
        _type: 'block',
        _key: 'p1',
        style: 'normal',
        children: [span('s1', '无 marks'), { ...span('s2', '空 marks'), marks: [] }],
      },
    ]
    const outcome = processPtRow('content', 9, JSON.stringify(body))
    expectMigrated(outcome)
    const converted = parseLexicalBody(JSON.parse(outcome.converted) as unknown)
    const text = firstParagraph(converted).text
    expect(text).toContain('无 marks')
    expect(text).toContain('空 marks')
  })

  it('drops dangling mark references without failing the migration', () => {
    const body = [block('p1', 'normal', [span('s1', '悬挂 mark', ['l1'])])]
    const outcome = processPtRow('content', 10, JSON.stringify(body))
    expectMigrated(outcome)
    const converted = parseLexicalBody(JSON.parse(outcome.converted) as unknown)
    // The text survives, unstyled — a dangling mark must never fail a migration.
    expect(JSON.stringify(converted)).toContain('悬挂 mark')
  })
})

describe('isPortableTextShape — PT-shape gate', () => {
  it('accepts arrays whose first element carries _type and the empty array', () => {
    expect(isPortableTextShape([])).toBe(true)
    expect(isPortableTextShape([{ _type: 'block' }])).toBe(true)
  })
  it('rejects non-arrays and arrays without _type on the first element', () => {
    expect(isPortableTextShape({})).toBe(false)
    expect(isPortableTextShape('text')).toBe(false)
    expect(isPortableTextShape(null)).toBe(false)
    expect(isPortableTextShape([1, 2])).toBe(false)
    expect(isPortableTextShape([{ key: 'x' }])).toBe(false)
  })
})

describe('convertPtRow / gateConverted — direct call surface', () => {
  it('converts and gates content and comment bodies', () => {
    const content = convertPtRow(richContentBody, 'content')
    expect(() => gateConverted(content, 'content')).not.toThrow()
    const comment = convertPtRow(validCommentBody, 'comment')
    expect(() => gateConverted(comment, 'comment')).not.toThrow()
  })
  it('throws on an invalid body', () => {
    expect(() => convertPtRow([{ _type: 'nope' }], 'content')).toThrow()
  })
})

describe('truncateError — stable truncation', () => {
  it('caps messages at 300 chars', () => {
    expect(truncateError(new Error('x'.repeat(500)))).toHaveLength(301) // 300 + ellipsis
    expect(truncateError(new Error('short'))).toBe('short')
    expect(truncateError('plain string')).toBe('plain string')
    expect(truncateError(undefined)).toBe('undefined')
  })
})

describe('verifyBodySanity — post-migration sanity assertions', () => {
  it('passes a healthy converted content body', () => {
    const outcome = processPtRow('content', 1, JSON.stringify(richContentBody))
    expectMigrated(outcome)
    const body = parseLexicalBody(JSON.parse(outcome.converted) as unknown)
    expect(verifyBodySanity(body, 'content')).toEqual([])
  })

  it('flags a footnoteRef whose targetKey has no footnoteDefinition', () => {
    const body = unsafeCast<LexicalBody>({
      root: {
        direction: null,
        format: '',
        indent: 0,
        type: 'root',
        version: 1,
        children: [
          {
            direction: null,
            format: '',
            indent: 0,
            type: 'paragraph',
            textFormat: 0,
            textStyle: '',
            children: [{ type: 'footnoteRef', version: 1, targetKey: 'ghost', index: 1, ptKey: 'fn1' }],
            version: 1,
          },
        ],
      },
    })
    const failures = verifyBodySanity(body, 'content')
    expect(failures).toHaveLength(1)
    expect(failures[0]).toContain('footnoteRef targetKey "ghost"')
  })

  it('accepts a footnoteRef whose target exists', () => {
    const body = unsafeCast<LexicalBody>({
      root: {
        direction: null,
        format: '',
        indent: 0,
        type: 'root',
        version: 1,
        children: [
          {
            direction: null,
            format: '',
            indent: 0,
            type: 'paragraph',
            textFormat: 0,
            textStyle: '',
            children: [{ type: 'footnoteRef', version: 1, targetKey: 'fd1', index: 1, ptKey: 'fn1' }],
            version: 1,
          },
          {
            direction: null,
            format: '',
            indent: 0,
            type: 'footnoteDefinition',
            version: 1,
            ptKey: 'fd1',
            index: 1,
            children: [],
          },
        ],
      },
    })
    expect(verifyBodySanity(body, 'content')).toEqual([])
  })

  it('flags containers nested deeper than the content cap of 2', () => {
    const body = unsafeCast<LexicalBody>({
      root: {
        direction: null,
        format: '',
        indent: 0,
        type: 'root',
        version: 1,
        children: [
          {
            direction: null,
            format: '',
            indent: 0,
            type: 'solution',
            version: 1,
            ptKey: 's1',
            children: [
              {
                direction: null,
                format: '',
                indent: 0,
                type: 'solution',
                version: 1,
                ptKey: 's2',
                children: [],
              },
            ],
          },
        ],
      },
    })
    const failures = verifyBodySanity(body, 'content')
    expect(failures.some((message) => message.includes('container node "solution"'))).toBe(true)
  })

  it('flags comment lists nested deeper than 4', () => {
    const listItem = (children: unknown[]) => ({
      direction: null,
      format: '',
      indent: 0,
      type: 'listitem',
      value: 1,
      children,
    })
    const list = (children: unknown[]) => ({
      direction: null,
      format: '',
      indent: 0,
      type: 'list',
      listType: 'bullet',
      start: 1,
      tag: 'ul',
      children,
    })
    const body = unsafeCast<LexicalCommentBody>({
      root: {
        direction: null,
        format: '',
        indent: 0,
        type: 'root',
        version: 1,
        children: [
          list([listItem([list([listItem([list([listItem([list([listItem([list([listItem([])])])])])])])])])]),
        ],
      },
    })
    const failures = verifyBodySanity(body, 'comment')
    expect(failures.some((message) => message.includes('list nesting depth 5'))).toBe(true)
  })

  it('does not apply the container cap to comments nor the list cap to content', () => {
    const deepList = unsafeCast<LexicalBody>({
      root: {
        direction: null,
        format: '',
        indent: 0,
        type: 'root',
        version: 1,
        children: [
          {
            direction: null,
            format: '',
            indent: 0,
            type: 'list',
            listType: 'bullet',
            start: 1,
            tag: 'ul',
            children: [
              {
                direction: null,
                format: '',
                indent: 0,
                type: 'listitem',
                value: 1,
                children: [],
              },
            ],
          },
        ],
      },
    })
    expect(verifyBodySanity(deepList, 'content')).toEqual([])
    expect(verifyBodySanity(deepList, 'comment')).toEqual([])
  })

  it('flags link urls that fail isSafeUrl', () => {
    const body = unsafeCast<LexicalBody>({
      root: {
        direction: null,
        format: '',
        indent: 0,
        type: 'root',
        version: 1,
        children: [
          {
            direction: null,
            format: '',
            indent: 0,
            type: 'paragraph',
            textFormat: 0,
            textStyle: '',
            children: [
              {
                direction: null,
                format: '',
                indent: 0,
                type: 'link',
                url: 'javascript:alert(1)',
                rel: null,
                target: null,
                title: null,
                children: [],
                version: 1,
              },
            ],
            version: 1,
          },
        ],
      },
    })
    const failures = verifyBodySanity(body, 'content')
    expect(failures.some((message) => message.includes('failed isSafeUrl'))).toBe(true)
  })
})
