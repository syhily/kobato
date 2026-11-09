import { describe, expect, it } from 'vitest'

import { compactLexicalEditorState } from '@/shared/lexical/dialect'
import { lexicalEditorStateSchema, type LexicalEditorState } from '@/shared/lexical/schema'
import { unsafeCast } from '@/shared/utils/unsafe-cast'

// The dialect pair (src/shared/lexical/dialect.ts): compact storage payloads
// omit serializer-default keys; the schema's normalize preprocess refills
// them, so both dialects parse to the same full-dialect output.

function text(value: string, extra: Record<string, unknown> = {}) {
  return { type: 'extended-text', version: 1, detail: 0, format: 0, mode: 'normal', style: '', text: value, ...extra }
}

function element(type: string, children: unknown[] = [], extra: Record<string, unknown> = {}) {
  return { type, version: 1, children, direction: null, format: '', indent: 0, ...extra }
}

function state(children: unknown[]) {
  return { root: element('root', children) }
}

/** A full-dialect document touching every default-rule family. */
function fullDocument() {
  return state([
    element('paragraph', [text('plain')], { textFormat: 0, textStyle: '' }),
    element('extended-heading', [text('Title')], { tag: 'h2' }),
    element('extended-quote', [element('paragraph', [text('quoted')], { textFormat: 0, textStyle: '' })]),
    element('list', [element('listitem', [text('bullet')], { value: 1 })], { listType: 'bullet', start: 1, tag: 'ul' }),
    element('list', [element('listitem', [text('numbered')], { value: 1 })], {
      listType: 'number',
      start: 3,
      tag: 'ol',
    }),
    element('list', [element('listitem', [text('done')], { value: 1, checked: true })], {
      listType: 'check',
      start: 1,
      tag: 'ul',
    }),
    element(
      'paragraph',
      [
        element('link', [text('site')], { url: 'https://example.com', target: null, rel: null, title: null }),
        element('autolink', [text('https://a.example')], {
          url: 'https://a.example',
          isUnlinked: false,
          target: null,
          rel: null,
          title: null,
        }),
      ],
      { textFormat: 0, textStyle: '' },
    ),
    element('table', [
      element('tablerow', [
        element('tablecell', [element('paragraph', [text('h')], { textFormat: 0, textStyle: '' })], {
          headerState: 1,
          colSpan: 1,
          rowSpan: 1,
          backgroundColor: null,
        }),
      ]),
    ]),
    { type: 'horizontalrule', version: 1 },
    { type: 'linebreak', version: 1 },
  ])
}

describe('compactLexicalEditorState', () => {
  it('strips serializer-default keys from every node family', () => {
    const json = JSON.parse(
      JSON.stringify(compactLexicalEditorState(fullDocument() as LexicalEditorState)),
    ) as ReturnType<typeof fullDocument>

    expect(json.root).toEqual({ type: 'root', children: expect.any(Array) })
    const [paragraph, heading, quote, bullet, numbered, check, links, table, hr, br] = json.root.children as never[]

    // paragraph: element triple + textFormat/textStyle + version stripped
    expect(paragraph).toEqual({
      type: 'paragraph',
      children: [{ type: 'extended-text', text: 'plain' }],
    })
    // heading keeps its tag
    expect(heading).toEqual({
      type: 'extended-heading',
      tag: 'h2',
      children: [{ type: 'extended-text', text: 'Title' }],
    })
    expect(quote).toEqual({
      type: 'extended-quote',
      children: [{ type: 'paragraph', children: [{ type: 'extended-text', text: 'quoted' }] }],
    })
    // bullet list keeps listType, drops derivable tag/start
    expect(bullet).toEqual({
      type: 'list',
      listType: 'bullet',
      children: [{ type: 'listitem', children: [{ type: 'extended-text', text: 'bullet' }] }],
    })
    // number list drops listType (= the import default) and tag, keeps start 3
    expect(numbered).toEqual({
      type: 'list',
      start: 3,
      children: [{ type: 'listitem', children: [{ type: 'extended-text', text: 'numbered' }] }],
    })
    // check item keeps its checked flag
    expect(check).toEqual({
      type: 'list',
      listType: 'check',
      children: [{ type: 'listitem', checked: true, children: [{ type: 'extended-text', text: 'done' }] }],
    })
    // link/autolink: null defaults and isUnlinked:false stripped
    expect(links).toEqual({
      type: 'paragraph',
      children: [
        { type: 'link', url: 'https://example.com', children: [{ type: 'extended-text', text: 'site' }] },
        {
          type: 'autolink',
          url: 'https://a.example',
          children: [{ type: 'extended-text', text: 'https://a.example' }],
        },
      ],
    })
    expect(table).toEqual({
      type: 'table',
      children: [
        {
          type: 'tablerow',
          children: [
            {
              type: 'tablecell',
              headerState: 1,
              children: [{ type: 'paragraph', children: [{ type: 'extended-text', text: 'h' }] }],
            },
          ],
        },
      ],
    })
    expect(hr).toEqual({ type: 'horizontalrule' })
    expect(br).toEqual({ type: 'linebreak' })
  })

  it('keeps non-default values', () => {
    const doc = state([
      element('paragraph', [text('bold', { format: 1 }), text('styled', { style: 'color: red;' })], {
        format: 'center',
        indent: 2,
        textFormat: 1,
        textStyle: '',
      }),
      element('list', [element('listitem', [text('x')], { value: 4, checked: false })], {
        listType: 'check',
        start: 2,
        tag: 'ul',
      }),
      element('link', [text('l')], { url: 'https://example.com', target: '_blank', rel: 'noopener', title: 't' }),
      element('table', [], { frozenColumnCount: 1, rowStriping: true }),
    ])
    const compact = JSON.parse(JSON.stringify(compactLexicalEditorState(doc as LexicalEditorState))) as ReturnType<
      typeof state
    >
    const [paragraph, list, link, table] = compact.root.children as Record<string, unknown>[]

    expect(paragraph).toMatchObject({ format: 'center', indent: 2, textFormat: 1 })
    expect((paragraph.children as Record<string, unknown>[])[0]).toMatchObject({ format: 1 })
    expect((paragraph.children as Record<string, unknown>[])[1]).toMatchObject({ style: 'color: red;' })
    expect(list).toMatchObject({ listType: 'check', start: 2 })
    expect((list.children as Record<string, unknown>[])[0]).toMatchObject({ value: 4, checked: false })
    expect(link).toMatchObject({ target: '_blank', rel: 'noopener', title: 't' })
    expect(table).toMatchObject({ frozenColumnCount: 1, rowStriping: true })
  })

  it('never mutates its input', () => {
    const doc = fullDocument() as LexicalEditorState
    const before = JSON.stringify(doc)
    compactLexicalEditorState(doc)
    expect(JSON.stringify(doc)).toBe(before)
  })
})

describe('normalizeLexicalDialect (schema preprocess)', () => {
  it('parses a compact payload to the same output as the full dialect', () => {
    const full = fullDocument()
    const compact = compactLexicalEditorState(fullDocument() as LexicalEditorState)
    expect(lexicalEditorStateSchema.parse(compact)).toEqual(lexicalEditorStateSchema.parse(full))
  })

  it('re-derives the list tag from listType, including the number-list default', () => {
    const compact = compactLexicalEditorState(fullDocument() as LexicalEditorState) as Record<string, unknown>
    const parsed = lexicalEditorStateSchema.parse(compact)
    const lists = unsafeCast<Array<{ type: string; listType: string; tag: string }>>(parsed.root.children).filter(
      (node) => node.type === 'list',
    )
    expect(lists.map((node) => [node.listType, node.tag])).toEqual([
      ['bullet', 'ul'],
      ['number', 'ol'],
      ['check', 'ul'],
    ])
  })

  it('heals the historical legacy dialect (paragraph without textFormat/textStyle)', () => {
    const legacyParagraph = element('paragraph', [text('old')])
    const parsed = lexicalEditorStateSchema.parse(state([legacyParagraph]))
    expect(parsed.root.children[0]).toMatchObject({ textFormat: 0, textStyle: '' })
  })

  it('passes shapes without an object root through to the shape errors', () => {
    expect(lexicalEditorStateSchema.safeParse('nonsense').success).toBe(false)
    expect(lexicalEditorStateSchema.safeParse({ root: 42 }).success).toBe(false)
  })

  it('does not mutate the candidate', () => {
    const compact = compactLexicalEditorState(fullDocument() as LexicalEditorState)
    const before = JSON.stringify(compact)
    lexicalEditorStateSchema.parse(compact)
    expect(JSON.stringify(compact)).toBe(before)
  })

  it('is idempotent over the compact/parse round trip', () => {
    const full = fullDocument()
    const once = compactLexicalEditorState(lexicalEditorStateSchema.parse(full))
    const twice = compactLexicalEditorState(lexicalEditorStateSchema.parse(once))
    expect(JSON.parse(JSON.stringify(twice))).toEqual(JSON.parse(JSON.stringify(once)))
  })
})
