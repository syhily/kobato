export interface InlineDelimiter {
  format: 'highlight' | 'subscript' | 'superscript'
  tag: string
}
export const INLINE_DELIMITERS = [
  { format: 'highlight', tag: '==' },
  { format: 'subscript', tag: '~' },
  { format: 'superscript', tag: '^' },
] as const satisfies readonly InlineDelimiter[]
export function inlineDelimiterTag(format: InlineDelimiter['format']): string {
  // the table is closed and satisfies-checked — a missing entry is a
  // compile-time table edit, never a runtime state
  return INLINE_DELIMITERS.find((delimiter) => delimiter.format === format)?.tag ?? ''
}
/** enter/tab trigger: fires on the key regardless of trailing space. NOT
 * end-anchored, so the `(\w{1,10})` group does not cap the language length
 * on this trigger. */
export const FENCE_KEYBOARD_REGEXP = /^```(\w{1,10})?/

/** markdown transformer trigger: the trailing `\s` makes the fence fire on
 * the space keystroke after ```lang while typing — and keeps markdown import
 * from claiming bare fences. */
export const FENCE_TRANSFORMER_REGEXP = /^```(\w{1,10})?\s/

/** round-trip import trigger: language names are free input on export
 * (`codeBlockFence` emits them verbatim), so import accepts more than \w —
 * c++, shell-session, etc. Card fences (```inkling:<card>```) still win:
 * buildTransformers orders CARD_TRANSFORMERS before CODE_FENCE. */
export const FENCE_IMPORT_REGEXP = /^```([^\s`]+)?\s*$/

export const FENCE_END_REGEXP = /^```\s*$/
