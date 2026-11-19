import type { DecoratorNodeProperty } from '@kobato/inkling/headless'

import {
  type CardRenderContext,
  type CardRenderOutput,
  elementFromHtml,
  feedPassthroughElement,
  htmlToPlainText,
  isFeedVariantRender,
} from '@kobato/lexical/cards/card-html.ts'
import { TWO_COLUMN_NODE_TYPE } from '@kobato/lexical/node-whitelist.ts'

export const TWO_COLUMN_CARD_PROPERTIES = [
  { name: 'left', default: '', urlType: 'html', wordCount: true },
  { name: 'right', default: '', urlType: 'html', wordCount: true },
] as const satisfies readonly DecoratorNodeProperty[]

export const TWO_COLUMN_NESTED_EDITORS = [
  { name: 'leftEditor', serializedKey: 'left', cleanBasicHtml: { allowBr: true } },
  { name: 'rightEditor', serializedKey: 'right', cleanBasicHtml: { allowBr: true } },
] as const

export const TWO_COLUMN_CARD_CLASSES = {
  root: 'my-6 grid grid-cols-1 gap-6 md:grid-cols-2 md:gap-8',
  pane: 'min-w-0',
} as const

export interface TwoColumnCardDataset {
  left: string
  right: string
}

function paneHtml(side: 'left' | 'right', content: string): string {
  return `<div class="${TWO_COLUMN_CARD_CLASSES.pane}" data-pt-two-column-pane="" data-side="${side}">${content}</div>`
}

export function renderTwoColumnCard(node: TwoColumnCardDataset, context: CardRenderContext): CardRenderOutput {
  const document = context.createDocument()
  const safeLeft = context.sanitizeBasicHtml(node.left)
  const safeRight = context.sanitizeBasicHtml(node.right)
  if (isFeedVariantRender(context)) {
    return { element: feedPassthroughElement(document, safeLeft + safeRight), type: 'inner' }
  }
  const element = elementFromHtml(
    document,
    `<section class="${TWO_COLUMN_CARD_CLASSES.root}" data-pt-two-column="">${paneHtml('left', safeLeft)}${paneHtml('right', safeRight)}</section>`,
    TWO_COLUMN_NODE_TYPE,
  )
  return { element, type: 'outer' }
}

export function twoColumnCardTextContent(node: { __left?: unknown; __right?: unknown }): string {
  const left = htmlToPlainText(typeof node.__left === 'string' ? node.__left : '')
  const right = htmlToPlainText(typeof node.__right === 'string' ? node.__right : '')
  const text = [left, right].filter((part) => part !== '').join('\n')
  return text === '' ? '' : `${text}\n\n`
}
