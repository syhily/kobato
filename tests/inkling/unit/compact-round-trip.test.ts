import { describe, expect, it } from 'vitest'

import type { LexicalEditorState } from '@/shared/lexical/schema'

import { createEditor } from '#/inkling/transforms/utils'
import { compactLexicalEditorState } from '@/shared/lexical/dialect'

// Contract between the compact storage dialect and the real 0.53 parser:
// re-parsing a compacted document through `parseEditorState` must heal every
// stripped default key, reproducing the full export byte-for-byte. If a
// Lexical upgrade changes a serializer default or stops healing one, this
// corpus fails before stored payloads silently change meaning.

// A full-dialect document covering every node family the article schema
// accepts (fixtures pin the live-export key shape; cards included).
const CORPUS = {
  root: {
    type: 'root',
    version: 1,
    direction: null,
    format: '',
    indent: 0,
    children: [
      {
        type: 'paragraph',
        version: 1,
        direction: null,
        format: '',
        indent: 0,
        textFormat: 0,
        textStyle: '',
        children: [
          { type: 'extended-text', version: 1, detail: 0, format: 0, mode: 'normal', style: '', text: 'plain ' },
          { type: 'extended-text', version: 1, detail: 0, format: 1, mode: 'normal', style: '', text: 'bold ' },
          {
            type: 'extended-text',
            version: 1,
            detail: 0,
            format: 0,
            mode: 'normal',
            style: 'color: red;',
            text: 'styled',
          },
          { type: 'linebreak', version: 1 },
          {
            type: 'link',
            version: 1,
            direction: null,
            format: '',
            indent: 0,
            url: 'https://example.com',
            target: null,
            rel: null,
            title: null,
            children: [
              { type: 'extended-text', version: 1, detail: 0, format: 0, mode: 'normal', style: '', text: 'link' },
            ],
          },
          {
            type: 'link',
            version: 1,
            direction: null,
            format: '',
            indent: 0,
            url: 'https://example.com',
            target: '_blank',
            rel: 'noopener',
            title: 't',
            children: [
              { type: 'extended-text', version: 1, detail: 0, format: 0, mode: 'normal', style: '', text: 'link2' },
            ],
          },
        ],
      },
      {
        type: 'paragraph',
        version: 1,
        direction: 'rtl',
        format: 'center',
        indent: 2,
        textFormat: 1,
        textStyle: '',
        children: [
          { type: 'extended-text', version: 1, detail: 0, format: 0, mode: 'normal', style: '', text: 'aligned' },
        ],
      },
      {
        type: 'extended-heading',
        version: 1,
        direction: null,
        format: '',
        indent: 0,
        tag: 'h2',
        children: [
          { type: 'extended-text', version: 1, detail: 0, format: 0, mode: 'normal', style: '', text: 'title' },
        ],
      },
      {
        type: 'extended-quote',
        version: 1,
        direction: null,
        format: '',
        indent: 0,
        children: [
          { type: 'extended-text', version: 1, detail: 0, format: 0, mode: 'normal', style: '', text: 'quote' },
        ],
      },
      {
        type: 'list',
        version: 1,
        direction: null,
        format: '',
        indent: 0,
        listType: 'bullet',
        start: 1,
        tag: 'ul',
        children: [
          {
            type: 'listitem',
            version: 1,
            direction: null,
            format: '',
            indent: 0,
            value: 1,
            children: [
              { type: 'extended-text', version: 1, detail: 0, format: 0, mode: 'normal', style: '', text: 'item' },
            ],
          },
        ],
      },
      {
        type: 'list',
        version: 1,
        direction: null,
        format: '',
        indent: 0,
        listType: 'number',
        start: 3,
        tag: 'ol',
        children: [
          {
            type: 'listitem',
            version: 1,
            direction: null,
            format: '',
            indent: 0,
            value: 1,
            children: [
              { type: 'extended-text', version: 1, detail: 0, format: 0, mode: 'normal', style: '', text: 'numbered' },
            ],
          },
        ],
      },
      {
        type: 'list',
        version: 1,
        direction: null,
        format: '',
        indent: 0,
        listType: 'check',
        start: 1,
        tag: 'ul',
        children: [
          {
            type: 'listitem',
            version: 1,
            direction: null,
            format: '',
            indent: 0,
            value: 1,
            checked: false,
            children: [
              { type: 'extended-text', version: 1, detail: 0, format: 0, mode: 'normal', style: '', text: 'off' },
            ],
          },
          {
            type: 'listitem',
            version: 1,
            direction: null,
            format: '',
            indent: 0,
            value: 2,
            checked: true,
            children: [
              { type: 'extended-text', version: 1, detail: 0, format: 0, mode: 'normal', style: '', text: 'on' },
            ],
          },
        ],
      },
      {
        type: 'image',
        version: 1,
        src: '/storage/posts/cover.png',
        caption: '',
        title: '',
        alt: 'cover',
        cardWidth: 'regular',
        width: 800,
        height: 600,
        href: '',
      },
      {
        type: 'codeblock',
        version: 1,
        code: 'const a = 1',
        language: 'ts',
        caption: '',
        highlightedHtml: '<pre class="shiki"/>',
      },
      { type: 'math', version: 1, tex: 'E=mc^2', mathml: '<math/>', svg: '<svg/>' },
      { type: 'horizontalrule', version: 1 },
    ],
  },
}

function jsonRoundTrip(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value))
}

describe('compact storage dialect', () => {
  it('re-parses to the identical full export through the real Lexical parser', () => {
    const editor = createEditor()
    const full = jsonRoundTrip(editor.parseEditorState(JSON.stringify(CORPUS)).toJSON())

    const compact = compactLexicalEditorState(full as LexicalEditorState)
    const reparsed = jsonRoundTrip(editor.parseEditorState(JSON.stringify(compact)).toJSON())

    expect(reparsed).toEqual(full)
  })

  it('shrinks the stored payload', () => {
    const editor = createEditor()
    const full = jsonRoundTrip(editor.parseEditorState(JSON.stringify(CORPUS)).toJSON())
    const compact = compactLexicalEditorState(full as LexicalEditorState)

    const fullBytes = JSON.stringify(full).length
    const compactBytes = JSON.stringify(compact).length
    // regression floor, not a target: the corpus ratio was ~0.72 when pinned
    expect(compactBytes).toBeLessThan(fullBytes * 0.8)
  })
})
