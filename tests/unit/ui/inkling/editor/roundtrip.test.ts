import { createHeadlessEditor } from '@lexical/headless'
import { describe, expect, it } from 'vitest'

import type {
  InklingBlockNode,
  InklingDocument,
  InklingFootnoteDefinitionNode,
  InklingInlineNode,
  InklingNonRecursiveBlockNode,
} from '@/shared/inkling/schema'
import type { FootnoteDefinitionItem } from '@/ui/inkling/editor/footnotes/InklingFootnoteProvider'

import { EMPTY_INKLING_DOCUMENT } from '@/shared/inkling/empty'
import { INKLING_LEXICAL_VERSION, safeValidateInklingDocument } from '@/shared/inkling/schema'
import { ARTICLE_NODES } from '@/ui/inkling/editor/nodes/registry'
import { mergeFootnoteDefinitions } from '@/ui/inkling/editor/plugins/OnInklingDocumentChangePlugin'
import { toSerializedRoot } from '@/ui/inkling/editor/shared/lexical-bridge'

/**
 * Storage-contract round-trip: `InklingDocument` → Lexical 0.13 editor state
 * (via the same hydrate path the article editor uses) → `InklingDocument`
 * (via the same merge+serialize path the change plugin uses). The output must
 * deep-equal the input for EVERY schema node type — this is the data-safety
 * gate for the vendored-editor migration. A failure here means stored bodies
 * would be corrupted by an open/save cycle in the new editor.
 *
 * Fixtures use the full Lexical-emitted field set (text nodes carry
 * `detail/format/mode/style`, elements carry `direction/format/indent`)
 * because that is the shape real editor output persists; hand-written
 * minimal fixtures would gain those fields on the way out by design.
 */

function text(value: string, format = 0): InklingInlineNode {
  return { type: 'text', version: 1, text: value, detail: 0, format, mode: 'normal', style: '' }
}

function paragraph(children: InklingInlineNode[]): InklingNonRecursiveBlockNode {
  return { type: 'paragraph', version: 1, direction: null, format: '', indent: 0, children }
}

function fullDocument(): InklingDocument {
  const children: InklingBlockNode[] = [
    paragraph([
      text('普通文本 '),
      text('加粗', 1),
      { type: 'linebreak', version: 1 },
      {
        type: 'link',
        version: 1,
        url: 'https://example.com/',
        rel: null,
        target: null,
        title: null,
        direction: null,
        format: '',
        indent: 0,
        children: [text('链接')],
      },
      { type: 'inline-math', version: 1, tex: 'e^{i\\pi}+1=0' },
      { type: 'footnote-ref', version: 1, targetKey: 'fn-a', refKey: 'ref-a', index: 1 },
    ]),
    { type: 'heading', version: 1, tag: 'h2', direction: null, format: '', indent: 0, children: [text('标题')] },
    { type: 'quote', version: 1, direction: null, format: '', indent: 0, children: [text('引用')] },
    {
      type: 'list',
      version: 1,
      listType: 'bullet',
      start: 1,
      tag: 'ul',
      direction: null,
      format: '',
      indent: 0,
      children: [
        {
          type: 'listitem',
          version: 1,
          value: 1,
          direction: null,
          format: '',
          indent: 0,
          children: [text('列表项')],
        },
      ],
    },
    {
      type: 'image-card',
      version: 1,
      src: 'https://example.com/a.webp',
      alt: '替代文本',
      caption: '说明',
      layout: 'center',
      width: 800,
      height: 600,
      thumbhash: 'abc123',
      storagePath: 'images/a.webp',
      imageId: 'img-1',
    },
    { type: 'code-block', version: 1, code: "console.log('hi')", language: 'ts', highlightedHtml: undefined },
    { type: 'math-block', version: 1, tex: '\\int_0^1 x\\,dx', mathml: undefined },
    { type: 'music-card', version: 1, playerId: 'player-1', auto: false, center: false },
    { type: 'horizontal-rule', version: 1 },
    {
      type: 'table',
      version: 1,
      rows: [
        {
          type: 'tablerow',
          version: 1,
          cells: [
            { type: 'tablecell', version: 1, isHeader: true, children: [text('表头')] },
            { type: 'tablecell', version: 1, isHeader: true, children: [text('表头2')] },
          ],
        },
        {
          type: 'tablerow',
          version: 1,
          cells: [
            { type: 'tablecell', version: 1, children: [text('单元格')] },
            { type: 'tablecell', version: 1, children: [text('单元格2')] },
          ],
        },
      ],
    },
    { type: 'solution', version: 1, children: [paragraph([text('隐藏解答')])] },
    {
      type: 'two-column',
      version: 1,
      left: [paragraph([text('左栏')])],
      right: [paragraph([text('右栏')])],
    },
    {
      type: 'footnote-definition',
      version: 1,
      targetKey: 'fn-a',
      index: 1,
      children: [paragraph([text('脚注内容')])],
    },
  ]
  return {
    _type: 'inkling',
    schemaVersion: 1,
    lexicalVersion: INKLING_LEXICAL_VERSION,
    root: { type: 'root', version: 1, direction: null, format: '', indent: 0, children },
  }
}

/** Hydrate exactly like `InklingArticleEditor`: strip footnote definitions
 *  into parallel state, parse the prose-only root. */
function hydrate(document: InklingDocument) {
  const proseChildren: InklingBlockNode[] = []
  const definitions: FootnoteDefinitionItem[] = []
  for (const child of document.root.children) {
    if (child.type === 'footnote-definition') {
      const def = child as InklingFootnoteDefinitionNode
      definitions.push({ targetKey: def.targetKey, index: def.index, children: structuredClone(def.children) })
    } else {
      proseChildren.push(child)
    }
  }
  const editor = createHeadlessEditor({
    namespace: 'inkling-roundtrip-test',
    nodes: ARTICLE_NODES,
    onError: (error: Error) => {
      throw error
    },
  })
  editor.setEditorState(
    editor.parseEditorState({ root: toSerializedRoot({ ...document.root, children: proseChildren }) }),
  )
  return { editor, definitions }
}

describe('inkling document ⇄ vendored-editor round trip', () => {
  it('round-trips a document containing every schema node type losslessly', () => {
    const original = fullDocument()
    const { editor, definitions } = hydrate(original)

    const output = mergeFootnoteDefinitions(editor.getEditorState(), {
      getDefinitions: () => definitions,
    })

    expect(output).toEqual(original)
  })

  it('produces schema-valid output', () => {
    const original = fullDocument()
    const { editor, definitions } = hydrate(original)

    const output = mergeFootnoteDefinitions(editor.getEditorState(), {
      getDefinitions: () => definitions,
    })

    const validation = safeValidateInklingDocument(output)
    expect(validation.ok).toBe(true)
  })

  it('round-trips the canonical empty document', () => {
    const original = structuredClone(EMPTY_INKLING_DOCUMENT) as InklingDocument
    const { editor, definitions } = hydrate(original)
    const output = mergeFootnoteDefinitions(editor.getEditorState(), { getDefinitions: () => definitions })
    expect(output).toEqual(original)
  })
})
