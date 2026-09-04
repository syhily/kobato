// The `solution` host card (plan docs/plans/inkling-editor-replacement.md,
// round R10): kobato's 解答块 — a styled blockquote whose body is one nested
// Lexical editor, serialized as cleaned HTML on the `content` dataset key.
// This module is the React-free single source shared by both bundle entries:
// the server projection (`@/server/infra/pt/lexical-projection`) builds its
// base class from these facts through the headless `generateDecoratorNode`,
// and the client card module (`@/client/editor/cards/solution`) builds the
// editing class through the `.` entry's factory + `defineCard`. Two class
// objects, one spec — the dist entries ship separate Lexical copies, so a
// shared class object would fail the entries' `instanceof` gates.
//
// The exported markup mirrors the existing public renderer
// (`src/ui/pt/blocks/Solution.tsx`) class-for-class: R13 renders the
// projection's `bodyHtml` directly, so exportDOM IS the future public
// render. The feed variant unwraps to the bare content HTML, matching the
// PT rssMode behavior (`src/server/render/pt-html.ts`).

import type { DecoratorNodeProperty } from '@inkling/editor/headless'

import {
  type CardRenderContext,
  type CardRenderOutput,
  elementFromHtml,
  feedPassthroughElement,
  htmlToPlainText,
  isFeedVariantRender,
} from '@/shared/lexical/cards/card-html'
import { SOLUTION_NODE_TYPE } from '@/shared/lexical/node-whitelist'

export const SOLUTION_CARD_PROPERTIES = [
  // Nested-editor HTML payload (serializedKey of `contentEditor`).
  { name: 'content', default: '', urlType: 'html', wordCount: true },
] as const satisfies readonly DecoratorNodeProperty[]

/** The nested-editor facts, minus the node set (each bundle entry supplies
 * its own classes — they are per-entry Lexical copies). */
export const SOLUTION_NESTED_EDITOR = {
  name: 'contentEditor',
  serializedKey: 'content',
  cleanBasicHtml: { allowBr: true },
} as const

/** Class/copies shared by the exportDOM markup and the decorate chrome, so
 * the two render states cannot drift (the WYSIWYG gate). */
export const SOLUTION_CARD_CLASSES = {
  root: 'solution relative flow-root overflow-x-auto overflow-y-hidden p-[1.2rem] pr-9 pb-9 [-webkit-overflow-scrolling:touch]',
  begin: 'solution-begin mb-2 block text-[1.2rem] font-extrabold text-brand',
  qed: 'solution-qed pointer-events-none absolute right-3 bottom-3 inline-flex h-3.5 w-3.5 items-center justify-center text-ink-3',
} as const

export const SOLUTION_CARD_BEGIN_TEXT = '解：'

/** The QED square, serialized-attribute spelling (React's `strokeWidth` is
 * `stroke-width` here). The decorate component renders the same element. */
export const SOLUTION_CARD_QED_SVG =
  '<svg viewBox="0 0 14 14" class="block h-full w-full" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="1" y="1" width="12" height="12" /></svg>'

/** The dataset shape the renderer reads (the generated node satisfies it). */
export interface SolutionCardDataset {
  content: string
}

/**
 * The exportDOM render (both variants). Full fidelity: the styled
 * blockquote. Feed: the sanitized content spliced without the wrapper.
 */
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

/**
 * `getTextContent` override body for the server-registered class: the
 * headless node has no live nested editor, so the wordCount property would
 * leak raw HTML into the `body_text` corpus — strip it instead.
 */
export function solutionCardTextContent(node: { __content?: unknown }): string {
  const text = htmlToPlainText(typeof node.__content === 'string' ? node.__content : '')
  return text === '' ? '' : `${text}\n\n`
}
