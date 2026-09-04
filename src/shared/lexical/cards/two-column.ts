// The `two-column` host card (plan docs/plans/inkling-editor-replacement.md,
// round R10): kobato's 双栏块 — two nested Lexical editors (left/right
// panes), each serialized as cleaned HTML on its dataset key. Same
// dual-entry sharing contract as `./solution`: one React-free spec consumed
// by the headless projection class and the `.`-entry editing class.
//
// The full-fidelity markup mirrors the existing public renderer
// (`src/ui/pt/render.tsx` TwoColumnBlockComponent) attribute-for-attribute;
// the feed variant flattens to left + right content concatenated (PT rssMode
// parity, `src/server/render/pt-html.ts`).

import type { DecoratorNodeProperty } from '@inkling/editor/headless'

import {
  type CardRenderContext,
  type CardRenderOutput,
  elementFromHtml,
  feedPassthroughElement,
  htmlToPlainText,
  isFeedVariantRender,
} from '@/shared/lexical/cards/card-html'
import { TWO_COLUMN_NODE_TYPE } from '@/shared/lexical/node-whitelist'

export const TWO_COLUMN_CARD_PROPERTIES = [
  { name: 'left', default: '', urlType: 'html', wordCount: true },
  { name: 'right', default: '', urlType: 'html', wordCount: true },
] as const satisfies readonly DecoratorNodeProperty[]

/** Nested-editor facts per pane, minus the per-entry node sets. */
export const TWO_COLUMN_NESTED_EDITORS = [
  { name: 'leftEditor', serializedKey: 'left', cleanBasicHtml: { allowBr: true } },
  { name: 'rightEditor', serializedKey: 'right', cleanBasicHtml: { allowBr: true } },
] as const

/** Classes shared by the exportDOM markup and the decorate chrome. */
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

/** The exportDOM render. Full fidelity: the responsive grid section. Feed:
 * the two panes' content concatenated without the grid wrapper. */
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

/** `getTextContent` override body for the server-registered class — see
 * `solutionCardTextContent` for why the raw HTML must be stripped. */
export function twoColumnCardTextContent(node: { __left?: unknown; __right?: unknown }): string {
  const left = htmlToPlainText(typeof node.__left === 'string' ? node.__left : '')
  const right = htmlToPlainText(typeof node.__right === 'string' ? node.__right : '')
  const text = [left, right].filter((part) => part !== '').join('\n')
  return text === '' ? '' : `${text}\n\n`
}
