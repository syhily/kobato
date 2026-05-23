import type { PmBlockNode, PmInlineNode, PmMark } from '@/shared/pt/bridge/types'
import type { MarkDef, Span, TextBlock, StandardBlockStyle } from '@/shared/pt/schema'

import { headingLevelFromStyle } from '@/shared/pt/bridge/nodes/heading'
import { stringAttr, hashLinkHref } from '@/shared/pt/bridge/utils'

export function textBlockToPmNode(block: TextBlock, asListItemChild: boolean): PmBlockNode {
  const inlines: PmInlineNode[] = []
  for (const span of block.children) {
    pushSpan(inlines, span, block.markDefs ?? [])
  }
  if (asListItemChild) {
    return { type: 'paragraph', attrs: { _key: block._key }, content: inlines }
  }
  if (block.style === 'blockquote') {
    return {
      type: 'blockquote',
      attrs: { _key: block._key, ...(block.align ? { textAlign: block.align } : {}) },
      content: [{ type: 'paragraph', content: inlines }],
    }
  }
  const headingLevel = headingLevelFromStyle(block.style)
  if (headingLevel !== null) {
    return {
      type: 'heading',
      attrs: {
        _key: block._key,
        level: headingLevel,
        ...(block.align ? { textAlign: block.align } : {}),
      },
      content: inlines,
    }
  }
  return {
    type: 'paragraph',
    attrs: { _key: block._key, ...(block.align ? { textAlign: block.align } : {}) },
    content: inlines,
  }
}

export function pushSpan(out: PmInlineNode[], span: Span, markDefs: readonly MarkDef[]): void {
  if (span.text === '') {
    return
  }
  const marks = (span.marks ?? []).map((markName) => spanMarkToPmMark(markName, markDefs))
  out.push({ type: 'text', text: span.text, marks: marks.length > 0 ? marks : undefined })
}

export function spanMarkToPmMark(markName: string, markDefs: readonly MarkDef[]): PmMark {
  switch (markName) {
    case 'strong':
      return { type: 'bold' }
    case 'em':
      return { type: 'italic' }
    case 'underline':
      return { type: 'underline' }
    case 'strike-through':
      return { type: 'strike' }
    case 'code':
      return { type: 'code' }
  }
  // Reference into markDefs: link / mathInline / footnoteRef.
  const def = markDefs.find((entry) => entry._key === markName)
  if (!def) {
    return { type: 'unknownMark', attrs: { _key: markName } }
  }
  switch (def._type) {
    case 'link':
      return {
        type: 'link',
        attrs: { _key: def._key, href: def.href, rel: def.rel, target: def.target },
      }
    case 'mathInline':
      return {
        type: 'mathInline',
        attrs: { _key: def._key, tex: def.tex, mathml: def.mathml, svg: def.svg },
      }
    case 'footnoteRef':
      return {
        type: 'footnoteRef',
        attrs: { _key: def._key, targetKey: def.targetKey, index: def.index },
      }
  }
}

export function paragraphToTextBlock(
  node: PmBlockNode,
  ensureKey: (attrs: Record<string, unknown> | undefined) => string,
  style: StandardBlockStyle,
): TextBlock {
  const children: Span[] = []
  const markDefs: MarkDef[] = []
  let nextSpanKey = 0
  const inlines = (node.content ?? []).filter(isInline)
  for (const inline of inlines) {
    nextSpanKey += 1
    const spanKey = `s-${nextSpanKey.toString(36)}`
    const marks: string[] = []
    for (const mark of inline.marks ?? []) {
      const conv = pmMarkToSpanMark(mark)
      if (conv === null) {
        continue
      }
      if ('decorator' in conv) {
        marks.push(conv.decorator)
      } else {
        marks.push(conv.def._key)
        if (!markDefs.some((existing) => existing._key === conv.def._key)) {
          markDefs.push(conv.def)
        }
      }
    }
    children.push({
      _type: 'span',
      _key: spanKey,
      text: inline.text,
      marks: marks.length > 0 ? marks : undefined,
    })
  }
  const align = node.attrs?.textAlign as string | undefined
  return {
    _type: 'block',
    _key: ensureKey(node.attrs),
    style,
    ...(align === 'left' || align === 'center' || align === 'right' ? { align } : {}),
    children,
    markDefs: markDefs.length > 0 ? markDefs : undefined,
  }
}

export function pmMarkToSpanMark(mark: PmMark): { decorator: string } | { def: MarkDef } | null {
  switch (mark.type) {
    case 'bold':
      return { decorator: 'strong' }
    case 'italic':
      return { decorator: 'em' }
    case 'underline':
      return { decorator: 'underline' }
    case 'strike':
      return { decorator: 'strike-through' }
    case 'code':
      return { decorator: 'code' }
    case 'link': {
      const href = stringAttr(mark.attrs, 'href') ?? ''
      const explicit = stringAttr(mark.attrs, '_key')
      const key = explicit !== undefined && explicit !== '' ? explicit : `lk-${hashLinkHref(href)}`
      return {
        def: {
          _type: 'link',
          _key: key,
          href,
          rel: stringAttr(mark.attrs, 'rel'),
          target: stringAttr(mark.attrs, 'target'),
        },
      }
    }
    case 'mathInline': {
      const tex = stringAttr(mark.attrs, 'tex') ?? ''
      const key = stringAttr(mark.attrs, '_key') ?? `mi-${tex.length.toString(36)}`
      return {
        def: {
          _type: 'mathInline',
          _key: key,
          tex,
          mathml: stringAttr(mark.attrs, 'mathml'),
          svg: stringAttr(mark.attrs, 'svg'),
        },
      }
    }
    case 'footnoteRef': {
      const targetKey = stringAttr(mark.attrs, 'targetKey') ?? ''
      const key = stringAttr(mark.attrs, '_key') ?? `fr-${targetKey}`
      const index = numberAttr(mark.attrs, 'index') ?? 1
      return { def: { _type: 'footnoteRef', _key: key, targetKey, index } }
    }
    default:
      return null
  }
}

function isInline(node: { type: string }): node is PmInlineNode {
  return node.type === 'text'
}

function numberAttr(attrs: Record<string, unknown> | undefined, key: string): number | undefined {
  if (!attrs) {
    return undefined
  }
  const value = attrs[key]
  return typeof value === 'number' ? value : undefined
}
