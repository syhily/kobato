import type { LexicalNode } from 'lexical'

export const CARD_WIDTHS = ['regular', 'wide', 'full'] as const

export type CardWidth = (typeof CARD_WIDTHS)[number]

export function isCardWidth(width: unknown): width is CardWidth {
  return typeof width === 'string' && (CARD_WIDTHS as readonly string[]).includes(width)
}

export function normalizeCardWidth(width: unknown): CardWidth | undefined {
  return isCardWidth(width) ? width : undefined
}

/**
 * The runtime-width cards' `decorateTarget.width` mapper (image, video):
 * normalize the node's `cardWidth`, defaulting to `'regular'`. One home so
 * the per-card lambda — and its cast — is never re-typed per declaration.
 */
export function decorateCardWidth(node: LexicalNode): CardWidth {
  return normalizeCardWidth((node as { cardWidth?: unknown }).cardWidth) ?? 'regular'
}
