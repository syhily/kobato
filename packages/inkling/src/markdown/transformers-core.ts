// The card-free transformer sets (plan C5). Everything here depends only on
// `@lexical/markdown`, so a card-less surface (the `./core` entry) can take
// markdown shortcuts without importing the card shims behind
// `@/markdown/transformers` (HR / CODE_BLOCK / the DEFAULT set live there —
// their `dependencies` and trigger bodies construct card nodes).

import {
  ORDERED_LIST,
  TEXT_FORMAT_TRANSFORMERS,
  TEXT_MATCH_TRANSFORMERS,
  UNORDERED_LIST,
  type Transformer,
} from '@lexical/markdown'

import { inlineDelimiterTag } from '@/markdown/grammar'

// custom text format transformers — the `@lexical/markdown` engine's
// projection of the shared grammar table (`@/markdown/grammar`);
// HIGHLIGHT's `==` rides upstream's TEXT_FORMAT_TRANSFORMERS.
export const SUBSCRIPT = {
  format: ['subscript'] as const,
  tag: inlineDelimiterTag('subscript'),
  type: 'text-format' as const,
}

export const SUPERSCRIPT = {
  format: ['superscript'] as const,
  tag: inlineDelimiterTag('superscript'),
  type: 'text-format' as const,
}

export const CUSTOM_TEXT_FORMAT_TRANSFORMERS = [SUBSCRIPT, SUPERSCRIPT]

/**
 * The smallest safe set: text-format transformers act on TextNode only, and
 * the text-match set needs LinkNode (MINIMAL_NODES includes it). No element
 * transformers — heading/list/quote shortcuts require the corresponding
 * registered nodes, which a minimal composition does not have.
 */
export const MINIMAL_TRANSFORMERS: Transformer[] = [
  ...TEXT_FORMAT_TRANSFORMERS,
  ...CUSTOM_TEXT_FORMAT_TRANSFORMERS,
  ...TEXT_MATCH_TRANSFORMERS,
]

export const BASIC_TRANSFORMERS: Transformer[] = [
  UNORDERED_LIST,
  ORDERED_LIST,
  ...TEXT_FORMAT_TRANSFORMERS,
  ...CUSTOM_TEXT_FORMAT_TRANSFORMERS,
  ...TEXT_MATCH_TRANSFORMERS,
]
