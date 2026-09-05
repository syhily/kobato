// The shared markdown grammar table — one declaration of the syntax both of
// Inkling's markdown dialects speak (the paste dialect in
// `@/markdown/paste-dialect`, the card-aware round-trip dialect in
// `@/markdown/round-trip`), with each engine projecting its half:
//
// - **Inline delimiters** (`==mark==`, `~sub~`, `^sup^`): declared once in
//   `INLINE_DELIMITERS`. The `@lexical/markdown` engine projects the table
//   into its text-format transformers (`@/markdown/transformers-core`;
//   HIGHLIGHT rides upstream's TEXT_FORMAT_TRANSFORMERS, whose `==` tag the
//   table names). The markdown-it engine's projection is its plugin stack —
//   markdown-it-mark/sub/sup hardcode these delimiters — so the paste
//   dialect names the table at its mount site and
//   test/markdown/grammar.test.ts pins both engines honoring it.
// - **Code-fence triggers**: three named policies whose acceptance ranges
//   differ ON PURPOSE and are not flattened — keyboard (enter/tab fires on
//   the key regardless of trailing space, not end-anchored so the
//   `(\w{1,10})` group caps nothing), transformer (the trailing `\s` fires
//   on the space keystroke while typing and keeps import from claiming bare
//   fences), import (accepts free-form language names — c++,
//   shell-session — because export emits them verbatim). Plus the one
//   closing-fence regex the multiline import transformers share.
//
// The fence trigger BODIES stay in `@/markdown/card-shortcuts` (the seam
// that resolves the card class through the editor's registered-node map);
// this table owns only the grammar.

/**
 * One inline delimiter both dialects speak, mapped to the Lexical text
 * format it produces.
 */
export interface InlineDelimiter {
  format: 'highlight' | 'subscript' | 'superscript'
  tag: string
}

export const INLINE_DELIMITERS = [
  { format: 'highlight', tag: '==' },
  { format: 'subscript', tag: '~' },
  { format: 'superscript', tag: '^' },
] as const satisfies readonly InlineDelimiter[]

/** The delimiter tag for one format, read off the table by engine projections. */
export function inlineDelimiterTag(format: InlineDelimiter['format']): string {
  // the table is closed and satisfies-checked — a missing entry is a
  // compile-time table edit, never a runtime state
  return INLINE_DELIMITERS.find((delimiter) => delimiter.format === format)?.tag ?? ''
}

/** enter/tab trigger: fires on the key regardless of trailing space. NOT
 * end-anchored, so the `(\w{1,10})` group does not cap the language length
 * on this trigger (see `@/markdown/card-shortcuts`'s module comment). */
export const FENCE_KEYBOARD_REGEXP = /^```(\w{1,10})?/

/** markdown transformer trigger: the trailing `\s` makes the fence fire on
 * the space keystroke after ```lang while typing — and keeps markdown import
 * from claiming bare fences. */
export const FENCE_TRANSFORMER_REGEXP = /^```(\w{1,10})?\s/

/** round-trip import trigger: language names are free input on export
 * (`codeBlockFence` emits them verbatim), so import accepts more than \w —
 * c++, shell-session, etc. used to fall back to literal paragraphs. Card
 * fences (```inkling:<card>```) still win: buildTransformers orders
 * CARD_TRANSFORMERS before CODE_FENCE. */
export const FENCE_IMPORT_REGEXP = /^```([^\s`]+)?\s*$/

/** The closing fence, shared by the round-trip dialect's multiline import transformers. */
export const FENCE_END_REGEXP = /^```\s*$/
