import type {
  LexicalBlockNode,
  LexicalBody,
  LexicalInlineNode,
  LexicalParagraphNode,
  LexicalTextNode,
} from '@kobato/shared/lexical/schema'

import { lexicalBodyToHtml } from '@kobato/editor/lexical-html/lexicalBodyToHtml'
import { describe, expect, it } from 'vitest'

// Boundary tests for the string renderer that live with the editor
// package (the byte-exact manifest suite lives in apps/public/tests/unit/
// render/). These pin renderer-wide invariants: purity, mode defaults,
// degenerate inputs, and gate-bypass defense in both renderers.

function base(format = ''): { direction: null; format: string; indent: 0; version: 1 } {
  return { direction: null, format, indent: 0, version: 1 }
}

function text(text: string, format = 0): LexicalTextNode {
  return { detail: 0, format, mode: 'normal', style: '', text, type: 'text', version: 1 }
}

function para(children: LexicalInlineNode[]): LexicalParagraphNode {
  return { ...base(), type: 'paragraph', children, textFormat: 0, textStyle: '' }
}

function body(...children: LexicalBlockNode[]): LexicalBody {
  return { root: { ...base(), type: 'root', children } }
}

describe('lexicalBodyToHtml — renderer invariants', () => {
  it('is pure: identical input yields identical output', () => {
    const fixture = body(para([text('Hello', 1)]), { ...base(), type: 'horizontalrule', version: 1 })
    const options = { headingSlugs: ['a'], footnotesSectionTitle: 'Notes' }
    expect(lexicalBodyToHtml(fixture, options)).toBe(lexicalBodyToHtml(fixture, options))
  })

  it('defaults to default mode and the fallback footnotes title', () => {
    const html = lexicalBodyToHtml(body(para([text('x')])))
    expect(html).toBe('<div class="portable-text-body"><p>x</p></div>')
    const withDefinition = lexicalBodyToHtml(
      body({ ...base(), type: 'footnoteDefinition', index: 1, children: [para([text('N')])] }),
    )
    expect(withDefinition).toContain('>尾声礼记</h3>')
    // Empty-string section title falls back too.
    expect(
      lexicalBodyToHtml(body({ ...base(), type: 'footnoteDefinition', index: 1, children: [para([text('N')])] }), {
        footnotesSectionTitle: '   ',
      }),
    ).toContain('>尾声礼记</h3>')
  })

  it('handles a musicPlayer without metadata in every mode', () => {
    const fixture = body({ type: 'musicPlayer', version: 1, playerId: 'x' })
    const placeholder = '<p>🎵 此文章包含音乐播放器，请访问原文收听。</p>'
    expect(lexicalBodyToHtml(fixture)).toBe(`<div class="portable-text-body">${placeholder}</div>`)
    expect(lexicalBodyToHtml(fixture, { mode: 'rss' })).toBe(placeholder)
    expect(lexicalBodyToHtml(fixture, { mode: 'email' })).toBe(placeholder)
  })

  it('sanitizes script-bearing math markup in default mode', () => {
    const evil = '<math><mi>a</mi><script>alert(1)</script></math>'
    const html = lexicalBodyToHtml(body({ type: 'mathBlock', version: 1, tex: 'a', mathml: evil }))
    expect(html).not.toContain('script')
    expect(html).toContain('<math><mi>a</mi></math>')
  })

  it('strips the image srcset/thumbhash-enhancement contract from RSS output', () => {
    const html = lexicalBodyToHtml(
      body({ type: 'image', version: 1, src: 'https://cdn.example.com/i.jpg', alt: 'A', width: 100, height: 50 }),
      { mode: 'rss' },
    )
    expect(html).toBe('<figure><img src="https://cdn.example.com/i.jpg" alt="A" width="100" height="50"/></figure>')
  })
})
