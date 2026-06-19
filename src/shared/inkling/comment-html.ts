import type { InklingDocument, InklingInlineNode, InklingListNode } from '@/shared/inkling/schema'

import {
  INKLING_FORMAT_BOLD,
  INKLING_FORMAT_CODE,
  INKLING_FORMAT_ITALIC,
  INKLING_FORMAT_STRIKETHROUGH,
  INKLING_FORMAT_UNDERLINE,
} from '@/shared/inkling/format'
import { escapeHtml } from '@/shared/utils/security'

const NEWLINE = '\n'

function escapeAttr(input: string): string {
  return escapeHtml(input)
}

function isSafeUrl(url: string): boolean {
  return !/^\s*(javascript|data|vbscript):/i.test(url)
}

function renderFormattedText(text: string, format: number | undefined): string {
  let html = escapeHtml(text)
  if ((format ?? 0) === 0) {
    return html
  }
  if (((format ?? 0) & INKLING_FORMAT_BOLD) !== 0) {
    html = `<strong>${html}</strong>`
  }
  if (((format ?? 0) & INKLING_FORMAT_ITALIC) !== 0) {
    html = `<em>${html}</em>`
  }
  if (((format ?? 0) & INKLING_FORMAT_UNDERLINE) !== 0) {
    html = `<u>${html}</u>`
  }
  if (((format ?? 0) & INKLING_FORMAT_STRIKETHROUGH) !== 0) {
    html = `<del>${html}</del>`
  }
  if (((format ?? 0) & INKLING_FORMAT_CODE) !== 0) {
    html = `<code>${html}</code>`
  }
  return html
}

function renderInlineNode(node: InklingInlineNode): string {
  switch (node.type) {
    case 'text':
      return renderFormattedText(node.text, node.format)
    case 'linebreak':
      return '<br />'
    case 'inline-math':
      return `<code>$${escapeHtml(node.tex)}$</code>`
    case 'footnote-ref':
      return ''
    case 'link': {
      const children = node.children.map(renderInlineNode).join('')
      if (!isSafeUrl(node.url)) {
        return children
      }
      const rel = node.rel ?? 'nofollow noreferrer'
      const target = node.target ?? '_blank'
      return `<a href="${escapeAttr(node.url)}" rel="${escapeAttr(rel)}" target="${escapeAttr(target)}">${children}</a>`
    }
  }
}

function renderInlineNodes(nodes: readonly InklingInlineNode[]): string {
  return nodes.map(renderInlineNode).join('')
}

interface ListFrame {
  ordered: boolean
  level: number
}

function closeListStack(stack: ListFrame[], out: string[]): void {
  while (stack.length > 0) {
    const top = stack.pop()!
    out.push(top.ordered ? '</ol>' : '</ul>')
  }
}

function renderListNode(list: InklingListNode, level: number, stack: ListFrame[], out: string[]): void {
  const ordered = list.listType === 'number'
  // Close frames that sit deeper than current level or at same level with different ordering.
  while (stack.length > 0) {
    const top = stack[stack.length - 1]
    if (top.level > level || (top.level === level && top.ordered !== ordered)) {
      out.push(top.ordered ? '</ol>' : '</ul>')
      stack.pop()
      continue
    }
    break
  }
  // Open frames up to current level.
  while (stack.length === 0 || stack[stack.length - 1].level < level) {
    out.push(ordered ? '<ol>' : '<ul>')
    stack.push({ ordered, level: (stack[stack.length - 1]?.level ?? 0) + 1 })
  }
  for (const item of list.children) {
    let itemHtml = ''
    for (const child of item.children) {
      if (child.type === 'list') {
        renderListNode(child, level + 1, stack, out)
      } else {
        itemHtml += renderInlineNode(child)
      }
    }
    out.push(`<li>${itemHtml}</li>`)
  }
}

export function inklingCommentToHtml(document: InklingDocument): string {
  const out: string[] = []
  const stack: ListFrame[] = []

  for (const block of document.root.children) {
    switch (block.type) {
      case 'paragraph': {
        closeListStack(stack, out)
        out.push(`<p>${renderInlineNodes(block.children)}</p>`)
        break
      }
      case 'quote': {
        closeListStack(stack, out)
        out.push(`<blockquote>${renderInlineNodes(block.children)}</blockquote>`)
        break
      }
      case 'list': {
        renderListNode(block, 1, stack, out)
        break
      }
      case 'code-block': {
        closeListStack(stack, out)
        const language = block.language ? ` data-language="${escapeAttr(block.language)}"` : ''
        out.push(`<pre><code${language}>${escapeHtml(block.code)}</code></pre>`)
        break
      }
      case 'math-block': {
        closeListStack(stack, out)
        out.push(`<pre><code>$$${escapeHtml(block.tex)}$$</code></pre>`)
        break
      }
      case 'heading':
      case 'image-card':
      case 'music-card':
      case 'table':
      case 'horizontal-rule':
      case 'solution':
      case 'two-column':
      case 'footnote-definition':
        break
    }
  }

  closeListStack(stack, out)
  return out.join(NEWLINE)
}
