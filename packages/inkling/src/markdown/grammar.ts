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
  return INLINE_DELIMITERS.find((delimiter) => delimiter.format === format)?.tag ?? ''
}
export const FENCE_KEYBOARD_REGEXP = /^```(\w{1,10})?/

export const FENCE_TRANSFORMER_REGEXP = /^```(\w{1,10})?\s/

export const FENCE_IMPORT_REGEXP = /^```([^\s`]+)?\s*$/

export const FENCE_END_REGEXP = /^```\s*$/
