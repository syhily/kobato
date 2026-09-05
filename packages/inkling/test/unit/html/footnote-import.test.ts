// The footnote import lanes: the
// markdown `[^n]` paste dialect (markdown-it-footnote → sanitize → DOM
// import), kobato/inkling HTML, and the export → import → export round trip.
// The targetKey policy is import-is-a-new-entity: source anchor slugs only
// correlate refs with their definitions WITHIN one import pass; the keys
// themselves are always recast (see src/nodes/footnote/footnote-keys.ts).
import { describe, expect, it } from 'vitest'

import { htmlToLexical as importWithDom } from '#/utils/html-to-lexical-with-dom'
import { renderLive } from '#/utils/render-live'
import { markdownToSanitizedHtml } from '@/plugins/behaviour/markdownPaste'

interface NodeJSON {
  type: string
  children?: NodeJSON[]
  [key: string]: unknown
}

function htmlToLexical(html: string) {
  return importWithDom(html, {
    editorConfig: {
      onError(error: Error) {
        throw error
      },
    },
  }) as unknown as { root: { children: NodeJSON[] } }
}

function collect(nodes: NodeJSON[], type: string): NodeJSON[] {
  const found: NodeJSON[] = []
  for (const node of nodes) {
    if (node.type === type) {
      found.push(node)
    }
    if (node.children) {
      found.push(...collect(node.children, type))
    }
  }
  return found
}

const PASTE_MARKDOWN = 'note.[^1]\n\n[^1]: The **text**.'

describe('footnote import — the markdown paste lane', () => {
  it('imports a `[^1]` paste as a ref plus its definition, with a recast targetKey', () => {
    const state = htmlToLexical(markdownToSanitizedHtml(PASTE_MARKDOWN, { allowBr: false }))

    const refs = collect(state.root.children, 'footnote-ref')
    const definitions = collect(state.root.children, 'footnotedefinition')
    expect(refs).toHaveLength(1)
    expect(definitions).toHaveLength(1)

    // the markdown-it label brackets are stripped; the digit is the text
    expect(refs[0].text).toBe('1')
    // recast: the source slug never becomes the targetKey, and ref ↔
    // definition agree on the fresh one
    expect(refs[0].targetKey).not.toBe('fn1')
    expect(refs[0].targetKey).toBe(definitions[0].targetKey)

    // the definition content carries the inline markup, minus the backrefs
    expect(definitions[0].content).toContain('<strong>text</strong>')
    expect(definitions[0].content).not.toContain('footnote-backref')
    expect(definitions[0].content).not.toContain('↩')
    // kobato wire alignment: the export-time index rides along
    expect(definitions[0].index).toBe(1)

    // markdown-it's <hr class="footnotes-sep"> must not become an HR card
    expect(collect(state.root.children, 'horizontalrule')).toHaveLength(0)
  })

  it('keeps repeated citations of one footnote as ONE footnote', () => {
    const state = htmlToLexical(
      markdownToSanitizedHtml('note.[^1] and again[^1]\n\n[^1]: The text.', { allowBr: false }),
    )

    const refs = collect(state.root.children, 'footnote-ref')
    const definitions = collect(state.root.children, 'footnotedefinition')
    expect(refs).toHaveLength(2)
    expect(definitions).toHaveLength(1)
    // markdown-it labels the second citation [1:1] — the visible digit is 1
    expect(refs.map((ref) => ref.text)).toEqual(['1', '1'])
    expect(refs[0].targetKey).toBe(refs[1].targetKey)
    expect(refs[0].targetKey).toBe(definitions[0].targetKey)
  })
})

describe('footnote import — the HTML lane', () => {
  it('imports kobato SSR markup (sup without id/class, href-only anchor)', () => {
    const state = htmlToLexical(
      '<p>kobato<sup><a href="#user-content-fn-2">2</a></sup></p>' +
        '<section class="footnotes"><ol>' +
        '<li id="user-content-fn-2"><p>Note two</p>' +
        '<a data-footnote-backref="" href="#user-content-fnref-2">↩</a></li>' +
        '</ol></section>',
    )

    const refs = collect(state.root.children, 'footnote-ref')
    const definitions = collect(state.root.children, 'footnotedefinition')
    expect(refs).toHaveLength(1)
    expect(definitions).toHaveLength(1)
    expect(refs[0].text).toBe('2')
    expect(refs[0].targetKey).toBe(definitions[0].targetKey)
    expect(definitions[0].content).toContain('Note two')
    expect(definitions[0].content).not.toContain('↩')
  })

  it('recasts targetKeys per import pass: the same HTML pasted twice never collides', () => {
    const html = markdownToSanitizedHtml(PASTE_MARKDOWN, { allowBr: false })
    const first = htmlToLexical(html)
    const second = htmlToLexical(html)

    const firstKey = collect(first.root.children, 'footnote-ref')[0].targetKey
    const secondKey = collect(second.root.children, 'footnote-ref')[0].targetKey
    expect(firstKey).not.toBe(secondKey)
    // …while each pass stays internally consistent
    expect(collect(first.root.children, 'footnotedefinition')[0].targetKey).toBe(firstKey)
    expect(collect(second.root.children, 'footnotedefinition')[0].targetKey).toBe(secondKey)
  })
})

describe('footnote export → import → export round trip', () => {
  it('is byte-exact', () => {
    const doc = JSON.stringify({
      root: {
        children: [
          {
            type: 'paragraph',
            version: 1,
            format: '',
            indent: 0,
            direction: 'ltr',
            children: [
              { type: 'text', version: 1, detail: 0, format: 0, mode: 'normal', style: '', text: 'see' },
              {
                type: 'footnote-ref',
                version: 1,
                detail: 0,
                format: 0,
                mode: 'normal',
                style: '',
                text: '1',
                targetKey: 'keyA',
              },
            ],
          },
          { type: 'footnotedefinition', version: 1, targetKey: 'keyA', content: '<p>First note</p>' },
        ],
        direction: 'ltr',
        format: '',
        indent: 0,
        type: 'root',
        version: 1,
      },
    })

    const exported = renderLive(doc)
    const reexported = renderLive(JSON.stringify(htmlToLexical(exported)))
    expect(reexported).toBe(exported)
  })
})
