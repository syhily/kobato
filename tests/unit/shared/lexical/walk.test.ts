import { describe, expect, it } from 'vitest'

import type { LexicalNodeJson } from '@/shared/lexical/schema'

import { emptyLexicalBody, lexicalBodyWith, lexicalHeading, lexicalParagraph } from '#/_helpers/lexical'
import { lexicalNodeTextContent, visitLexicalNodes } from '@/shared/lexical/walk'

function quote(children: unknown[]) {
  return { type: 'extended-quote', version: 1, children, direction: 'ltr', format: '', indent: 0 }
}

describe('shared/lexical/walk — visitLexicalNodes', () => {
  it('visits every descendant depth-first in document order, never the root', () => {
    const state = lexicalBodyWith([
      lexicalParagraph('a'),
      quote([lexicalParagraph('b'), lexicalParagraph('c')]),
      lexicalHeading('h2', 'd'),
    ])

    const visited: string[] = []
    visitLexicalNodes(state, (node) => visited.push(node.type))

    expect(visited).toEqual([
      'paragraph',
      'extended-text',
      'extended-quote',
      'paragraph',
      'extended-text',
      'paragraph',
      'extended-text',
      'extended-heading',
      'extended-text',
    ])
  })

  it('handles an empty state', () => {
    const visited: string[] = []
    visitLexicalNodes(emptyLexicalBody(), (node) => visited.push(node.type))
    expect(visited).toEqual([])
  })

  it('does not recurse into decorator nodes (no children key)', () => {
    const state = lexicalBodyWith([
      { type: 'image', version: 1, src: '/storage/x.png' },
      { type: 'codeblock', version: 1, code: 'x', language: 'ts', caption: '', highlightedHtml: '' },
    ])
    const visited: string[] = []
    visitLexicalNodes(state, (node) => visited.push(node.type))
    expect(visited).toEqual(['image', 'codeblock'])
  })
})

describe('shared/lexical/walk — lexicalNodeTextContent', () => {
  it('returns the text of a text node', () => {
    const node = lexicalParagraph('hello').children[0] as LexicalNodeJson
    expect(lexicalNodeTextContent(node)).toBe('hello')
  })

  it("contributes '\\n' for linebreak nodes", () => {
    const paragraph = {
      type: 'paragraph',
      version: 1,
      direction: 'ltr',
      format: '',
      indent: 0,
      children: [
        { type: 'extended-text', version: 1, detail: 0, format: 0, mode: 'normal', style: '', text: 'a' },
        { type: 'linebreak', version: 1 },
        { type: 'extended-text', version: 1, detail: 0, format: 0, mode: 'normal', style: '', text: 'b' },
      ],
    } as LexicalNodeJson
    expect(lexicalNodeTextContent(paragraph)).toBe('a\nb')
  })

  it('contributes nothing for decorator nodes (Lexical getTextContent parity)', () => {
    for (const decorator of [
      { type: 'image', version: 1, src: '/storage/x.png' },
      { type: 'math', version: 1, tex: 'x^2', mathml: '', svg: '' },
      { type: 'math-inline', version: 1, tex: 'x^2', mathml: '', svg: '' },
      { type: 'codeblock', version: 1, code: 'const a = 1', language: 'ts', caption: '', highlightedHtml: '' },
      { type: 'music-player', version: 1, playerId: 'p1' },
    ]) {
      expect(lexicalNodeTextContent(decorator as LexicalNodeJson), decorator.type).toBe('')
    }
  })

  it('concatenates nested element children', () => {
    const quoteNode = quote([lexicalParagraph('ab'), lexicalParagraph('cd')]) as LexicalNodeJson
    expect(lexicalNodeTextContent(quoteNode)).toBe('abcd')
  })
})
