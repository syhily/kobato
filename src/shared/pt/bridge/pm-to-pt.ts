import type { PmDoc, PmNode, PmBlockNode, PmInlineNode } from '@/shared/pt/bridge/types'
import type {
  Block,
  FootnoteDefinitionBlock,
  PortableTextBody,
  SolutionBlock,
  TwoColumnBlock,
} from '@/shared/pt/schema'

import { synchronizeFootnoteIndices } from '@/shared/pt/bridge/nodes/footnote'
import { headingStyleFromLevel } from '@/shared/pt/bridge/nodes/heading'
import { flattenList } from '@/shared/pt/bridge/nodes/list'
import { pmTableToBlock } from '@/shared/pt/bridge/nodes/table'
import { paragraphToTextBlock } from '@/shared/pt/bridge/nodes/text'
import { isBlock, isInline, stringAttr, numberAttr } from '@/shared/pt/bridge/utils'
import { unsafeCast } from '@/shared/utils/unsafe-cast'

/** Convert a ProseMirror `doc` node back into a PortableText body. */
export function pmDocToBody(doc: PmDoc): PortableTextBody {
  const out: Block[] = []
  let nextKey = 0
  const ensureKey = (attrs: Record<string, unknown> | undefined): string => {
    if (attrs && typeof attrs._key === 'string' && attrs._key !== '') {
      return attrs._key
    }
    nextKey += 1
    return `pm-${nextKey.toString(36)}`
  }

  for (const node of doc.content) {
    pushPmNode(out, node, ensureKey)
  }
  return synchronizeFootnoteIndices(out)
}

export function pushPmNode(
  out: Block[],
  node: PmNode,
  ensureKey: (attrs: Record<string, unknown> | undefined) => string,
): void {
  if (isInline(node)) {
    return
  }
  switch (node.type) {
    case 'paragraph':
      out.push(paragraphToTextBlock(node, ensureKey, 'normal'))
      return
    case 'heading': {
      const level = typeof node.attrs?.level === 'number' ? node.attrs.level : 1
      const style = headingStyleFromLevel(level)
      out.push(paragraphToTextBlock(node, ensureKey, style))
      return
    }
    case 'blockquote': {
      // PortableText flattens — there is no "nested under blockquote" container.
      // Tiptap's Blockquote accepts `block+`, so the quote may carry lists,
      // code blocks, or even tables. Paragraphs adopt the blockquote style and
      // inherit the quote's textAlign; non-paragraph children flow back through
      // pushPmNode so their content survives (lists keep their items, code
      // keeps its body) instead of being silently dropped.
      const textAlign = node.attrs?.textAlign as string | undefined
      for (const child of (node.content ?? []).filter(isBlock)) {
        if (child.type === 'paragraph') {
          out.push(
            paragraphToTextBlock(
              { ...child, attrs: { ...child.attrs, ...(textAlign ? { textAlign } : {}) } },
              ensureKey,
              'blockquote',
            ),
          )
        } else if (child.type === 'bulletList' || child.type === 'orderedList') {
          flattenList(child, out, ensureKey, 1)
        } else {
          pushPmNode(out, child, ensureKey)
        }
      }
      return
    }
    case 'bulletList':
    case 'orderedList': {
      flattenList(node, out, ensureKey, 1)
      return
    }
    case 'image': {
      const layoutRaw = stringAttr(node.attrs, 'layout')
      const layout = layoutRaw === 'left' || layoutRaw === 'right' ? layoutRaw : undefined
      out.push({
        _type: 'image',
        _key: ensureKey(node.attrs),
        src: typeof node.attrs?.src === 'string' ? node.attrs.src : '',
        alt: stringAttr(node.attrs, 'alt'),
        caption: stringAttr(node.attrs, 'caption'),
        ...(layout !== undefined ? { layout } : {}),
        width: numberAttr(node.attrs, 'width'),
        height: numberAttr(node.attrs, 'height'),
        thumbhash: stringAttr(node.attrs, 'thumbhash'),
        storagePath: stringAttr(node.attrs, 'storagePath'),
        imageId: stringAttr(node.attrs, 'imageId'),
      })
      return
    }
    case 'codeBlock': {
      const text = (node.content ?? [])
        .filter((child): child is PmInlineNode => isInline(child))
        .map((child) => child.text)
        .join('')
      out.push({
        _type: 'code',
        _key: ensureKey(node.attrs),
        code: text,
        language: stringAttr(node.attrs, 'language'),
        highlightedHtml: stringAttr(node.attrs, 'highlightedHtml'),
      })
      return
    }
    case 'horizontalRule':
      out.push({ _type: 'horizontalRule', _key: ensureKey(node.attrs) })
      return
    case 'table': {
      out.push(pmTableToBlock(node, ensureKey))
      return
    }
    case 'solution': {
      const inner: Block[] = []
      for (const child of (node.content ?? []).filter(isBlock)) {
        pushPmNode(inner, child, ensureKey)
      }
      out.push({
        _type: 'solution',
        _key: ensureKey(node.attrs),
        children: unsafeCast<SolutionBlock['children']>(inner),
      })
      return
    }
    case 'twoColumn': {
      const panes = (node.content ?? []).filter(isBlock).filter((c) => c.type === 'twoColumnPane')
      const pickPane = (side: 'left' | 'right'): PmBlockNode | undefined => {
        const byAttr = panes.find((p) => stringAttr(p.attrs, 'side') === side)
        return byAttr ?? (side === 'left' ? panes[0] : panes[1])
      }
      const leftPane = pickPane('left')
      const rightPane = pickPane('right')
      const leftBlocks: Block[] = []
      const rightBlocks: Block[] = []
      const collectPane = (pane: PmBlockNode | undefined, target: Block[]): void => {
        if (pane === undefined) {
          return
        }
        for (const child of (pane.content ?? []).filter(isBlock)) {
          pushPmNode(target, child, ensureKey)
        }
      }
      collectPane(leftPane, leftBlocks)
      collectPane(rightPane, rightBlocks)
      out.push({
        _type: 'twoColumn',
        _key: ensureKey(node.attrs),
        left: unsafeCast<TwoColumnBlock['left']>(leftBlocks),
        right: unsafeCast<TwoColumnBlock['right']>(rightBlocks),
      })
      return
    }
    case 'footnoteDefinition': {
      const inner: Block[] = []
      for (const child of (node.content ?? []).filter(isBlock)) {
        pushPmNode(inner, child, ensureKey)
      }
      const rawIndex = node.attrs?.index
      const idx = typeof rawIndex === 'number' && Number.isFinite(rawIndex) ? Math.floor(rawIndex) : 1
      out.push({
        _type: 'footnoteDefinition',
        _key: ensureKey(node.attrs),
        index: idx >= 1 ? idx : 1,
        children: unsafeCast<FootnoteDefinitionBlock['children']>(inner),
      })
      return
    }
    case 'blockCard': {
      const payload = node.attrs?.payload
      if (payload && typeof payload === 'object' && '_type' in payload) {
        out.push(unsafeCast<Block>(payload))
      }
      return
    }
  }
}
