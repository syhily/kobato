import { inlineDelimiterTag } from '@kobato/inkling-internal/markdown/grammar'
import {
  ORDERED_LIST,
  TEXT_FORMAT_TRANSFORMERS,
  TEXT_MATCH_TRANSFORMERS,
  UNORDERED_LIST,
  type Transformer,
} from '@lexical/markdown'

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
