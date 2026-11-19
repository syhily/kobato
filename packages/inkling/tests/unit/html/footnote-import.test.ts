import { loadPasteDialect } from '@kobato/inkling-internal/markdown/lazy-paste-dialect'
import { markdownToSanitizedHtml } from '@kobato/inkling-internal/plugins/behaviour/markdown-paste'
import { htmlToLexical as importWithDom } from '@kobato/inkling/tests/utils/html-to-lexical-with-dom'
import { renderLive } from '@kobato/inkling/tests/utils/render-live'
// The footnote import lanes: the
// markdown `[^n]` paste dialect (markdown-it-footnote → sanitize → DOM
// import), kobato/inkling HTML, and the export → import → export round trip.
// The targetKey policy is import-is-a-new-entity: source anchor slugs only
// correlate refs with their definitions WITHIN one import pass; the keys
// themselves are always recast (see src/inkling/nodes/footnote/footnote-keys.ts).
import { beforeAll, describe, expect, it } from 'vitest'

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

// the paste dialect engine rides the lazy port; the sync converter reads the
// loaded cache — warm it once for every lane in this file
beforeAll(() => loadPasteDialect())

describe('footnote import — the markdown paste lane', () => {
  it('imports a `[^1]` paste as a ref plus its definition, with a recast targetKey', () => {
    const state = htmlToLexical(markdownToSanitizedHtml(PASTE_MARKDOWN, { allowBr: false }))

    const refs = collect(state.root.children, 'footnote-ref')
    const definitions = collect(state.root.children, 'footnotedefinition')
    expect(refs).toHaveLength(1)
    expect(definitions).toHaveLength(1)

    expect(refs[0].text).toBe('1')
    expect(refs[0].targetKey).not.toBe('fn1')
    expect(refs[0].targetKey).toBe(definitions[0].targetKey)

    expect(definitions[0].content).toContain('<strong>text</strong>')
    expect(definitions[0].content).not.toContain('footnote-backref')
    expect(definitions[0].content).not.toContain('↩')

    expect(definitions[0].index).toBe(1)

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
