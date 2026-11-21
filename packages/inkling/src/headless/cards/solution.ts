import type { DecoratorNodeProperty } from '@kobato/inkling-internal/nodes/base/card-specs'

import {
  type CardRenderContext,
  type CardRenderOutput,
  elementFromHtml,
  feedPassthroughElement,
  htmlToPlainText,
  isFeedVariantRender,
} from '@kobato/inkling-internal/headless/cards/card-html'
import { SOLUTION_NODE_TYPE } from '@kobato/inkling-internal/headless/node-whitelist'

export const SOLUTION_CARD_PROPERTIES = [
  { name: 'content', default: '', urlType: 'html', wordCount: true },
] as const satisfies readonly DecoratorNodeProperty[]

export const SOLUTION_NESTED_EDITOR = {
  name: 'contentEditor',
  serializedKey: 'content',
  cleanBasicHtml: { allowBr: true },
} as const

export const SOLUTION_CARD_CLASSES = {
  root: 'solution relative flow-root overflow-x-auto overflow-y-hidden p-[1.2rem] pr-9 pb-9 [-webkit-overflow-scrolling:touch]',
  begin: 'solution-begin mb-2 block text-[1.2rem] font-extrabold text-brand',
  qed: 'solution-qed pointer-events-none absolute right-3 bottom-3 inline-flex h-3.5 w-3.5 items-center justify-center text-ink-3',
} as const

export const SOLUTION_CARD_BEGIN_TEXT = '解：'

export const SOLUTION_CARD_QED_SVG =
  '<svg viewBox="0 0 14 14" class="block h-full w-full" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="1" y="1" width="12" height="12" /></svg>'

export interface SolutionCardDataset {
  content: string
}

export function renderSolutionCard(node: SolutionCardDataset, context: CardRenderContext): CardRenderOutput {
  const document = context.createDocument()
  const safeContent = context.sanitizeBasicHtml(node.content)
  if (isFeedVariantRender(context)) {
    return { element: feedPassthroughElement(document, safeContent), type: 'inner' }
  }
  const element = elementFromHtml(
    document,
    `<blockquote class="${SOLUTION_CARD_CLASSES.root}"><div class="${SOLUTION_CARD_CLASSES.begin}">${SOLUTION_CARD_BEGIN_TEXT}</div>${safeContent}<span class="${SOLUTION_CARD_CLASSES.qed}" aria-hidden="true">${SOLUTION_CARD_QED_SVG}</span></blockquote>`,
    SOLUTION_NODE_TYPE,
  )
  return { element, type: 'outer' }
}

export function solutionCardTextContent(node: { __content?: unknown }): string {
  const text = htmlToPlainText(typeof node.__content === 'string' ? node.__content : '')
  return text === '' ? '' : `${text}\n\n`
}
