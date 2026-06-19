import type { InklingDocument, InklingListItemNode } from '@/shared/inkling/schema'

import { walkInkling } from '@/shared/inkling/walk'

interface PlainTextCtx {
  out: string[]
  blockStarted: boolean
  listTypes: ('bullet' | 'number')[]
}

function pushText(ctx: PlainTextCtx, text: string): void {
  ctx.out.push(text)
  ctx.blockStarted = true
}

function endBlock(ctx: PlainTextCtx): void {
  if (ctx.blockStarted) {
    ctx.out.push('\n')
    ctx.blockStarted = false
  }
}

function listPrefix(ctx: PlainTextCtx, item: InklingListItemNode): string {
  const type = ctx.listTypes.at(-1)
  return type === 'number' ? `${item.value}. ` : '- '
}

export function inklingToPlainText(document: InklingDocument): string {
  const ctx: PlainTextCtx = { out: [], blockStarted: false, listTypes: [] }

  walkInkling(
    document,
    {
      text: (node, c) => {
        pushText(c, node.text)
      },
      linebreak: (_, c) => {
        pushText(c, '\n')
      },
      paragraph: (_, c, walkChildren) => {
        walkChildren()
        endBlock(c)
      },
      heading: (_, c, walkChildren) => {
        walkChildren()
        endBlock(c)
      },
      quote: (_, c, walkChildren) => {
        walkChildren()
        endBlock(c)
      },
      list: (node, c, walkChildren) => {
        if (c.blockStarted) {
          c.out.push('\n')
          c.blockStarted = false
        }
        c.listTypes.push(node.listType)
        walkChildren()
        c.listTypes.pop()
      },
      listitem: (node, c, walkChildren) => {
        pushText(c, listPrefix(c, node))
        walkChildren()
        endBlock(c)
      },
      link: (_, c, walkChildren) => {
        walkChildren()
      },
      image: (node, c) => {
        if (node.alt !== undefined && node.alt !== '') {
          pushText(c, node.alt)
        }
      },
      code: (node, c) => {
        pushText(c, node.code)
        endBlock(c)
      },
      mathBlock: (node, c) => {
        pushText(c, node.tex)
        endBlock(c)
      },
      inlineMath: (node, c) => {
        pushText(c, node.tex)
      },
      footnoteRef: (node, c) => {
        pushText(c, String(node.index))
      },
      music: (node, c) => {
        pushText(c, `[Music: ${node.playerId}]`)
        endBlock(c)
      },
      table: (_, c, walkChildren) => {
        walkChildren()
        endBlock(c)
      },
      tableCell: (_, c, walkChildren) => {
        walkChildren()
        c.out.push('\n')
        c.blockStarted = true
      },
      solution: (_, c, walkChildren) => {
        walkChildren()
        endBlock(c)
      },
      twoColumn: (_, c, walkChildren) => {
        walkChildren()
        endBlock(c)
      },
      footnoteDefinition: (_, c, walkChildren) => {
        walkChildren()
        endBlock(c)
      },
      horizontalRule: (_, c) => {
        pushText(c, '---')
        endBlock(c)
      },
    },
    ctx,
  )

  return ctx.out.join('').trim()
}
