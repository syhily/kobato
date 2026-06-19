import type { InklingDocument, InklingInlineNode, InklingListNode } from '@/shared/inkling/schema'

import {
  INKLING_FORMAT_BOLD,
  INKLING_FORMAT_CODE,
  INKLING_FORMAT_ITALIC,
  INKLING_FORMAT_STRIKETHROUGH,
  INKLING_FORMAT_UNDERLINE,
} from '@/shared/inkling/format'

const NEWLINE = '\n'
const INDENT_STEP = '  '

function escapeInline(text: string): string {
  return text.replace(/([\\`*_])/g, '\\$1')
}

function isSafeUrl(url: string): boolean {
  return !/^\s*(javascript|data|vbscript):/i.test(url)
}

function renderInlineNode(node: InklingInlineNode): string {
  switch (node.type) {
    case 'text': {
      const format = node.format ?? 0
      let text = escapeInline(node.text)
      if ((format & INKLING_FORMAT_CODE) !== 0) {
        return `\`${node.text}\``
      }
      if ((format & INKLING_FORMAT_STRIKETHROUGH) !== 0) {
        text = `~~${text}~~`
      }
      if ((format & INKLING_FORMAT_ITALIC) !== 0) {
        text = `*${text}*`
      }
      if ((format & INKLING_FORMAT_BOLD) !== 0) {
        text = `**${text}**`
      }
      if ((format & INKLING_FORMAT_UNDERLINE) !== 0) {
        text = `<u>${text}</u>`
      }
      return text
    }
    case 'linebreak':
      return '\n'
    case 'inline-math':
      return `$${node.tex}$`
    case 'footnote-ref':
      return ''
    case 'link': {
      const text = node.children.map(renderInlineNode).join('')
      if (!isSafeUrl(node.url)) {
        return text
      }
      const href = node.url.includes(')') ? `<${node.url}>` : node.url
      return `[${text}](${href})`
    }
  }
}

function renderInlineNodes(nodes: readonly InklingInlineNode[]): string {
  return nodes.map(renderInlineNode).join('')
}

function renderListNode(list: InklingListNode, baseLevel: number, out: string[]): void {
  const ordered = list.listType === 'number'
  const indent = INDENT_STEP.repeat(Math.max(0, baseLevel - 1))
  const bullet = ordered ? '1.' : '-'
  for (const item of list.children) {
    let itemText = ''
    for (const child of item.children) {
      if (child.type === 'list') {
        // Render nested list on its own lines after this item.
        if (itemText !== '') {
          out.push(`${indent}${bullet} ${itemText}`)
          itemText = ''
        }
        renderListNode(child, baseLevel + 1, out)
      } else {
        itemText += renderInlineNode(child)
      }
    }
    if (itemText !== '') {
      out.push(`${indent}${bullet} ${itemText}`)
    }
  }
}

export function inklingCommentToMarkdown(document: InklingDocument): string {
  const out: string[] = []
  let prevWasList = false
  let prevWasQuote = false

  for (const block of document.root.children) {
    switch (block.type) {
      case 'paragraph': {
        if (prevWasList || prevWasQuote) {
          out.push('')
        }
        out.push(renderInlineNodes(block.children))
        prevWasList = false
        prevWasQuote = false
        break
      }
      case 'quote': {
        if (prevWasList) {
          out.push('')
        }
        const lines = renderInlineNodes(block.children).split(NEWLINE)
        for (const line of lines) {
          out.push(`> ${line}`)
        }
        prevWasList = false
        prevWasQuote = true
        break
      }
      case 'list': {
        if (!prevWasList && out.length > 0) {
          out.push('')
        }
        renderListNode(block, 1, out)
        prevWasList = true
        prevWasQuote = false
        break
      }
      case 'code-block': {
        if (prevWasList || prevWasQuote) {
          out.push('')
        }
        const fence = '```'
        const head = block.language ? `${fence}${block.language}` : fence
        out.push(head, block.code, fence)
        prevWasList = false
        prevWasQuote = false
        break
      }
      case 'math-block': {
        if (prevWasList || prevWasQuote) {
          out.push('')
        }
        out.push(`$$${block.tex}$$`)
        prevWasList = false
        prevWasQuote = false
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

  return out.join(NEWLINE).trim()
}
