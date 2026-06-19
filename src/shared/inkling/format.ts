// Lexical text-format bit flags used by Inkling nodes.
// Keep in sync with Lexical's `IS_*` constants and the renderers in
// `src/ui/inkling/render/marks/TextMark.tsx` and
// `src/server/render/inkling/html.ts`.

export const INKLING_FORMAT_BOLD = 1
export const INKLING_FORMAT_ITALIC = 1 << 1
export const INKLING_FORMAT_STRIKETHROUGH = 1 << 2
export const INKLING_FORMAT_UNDERLINE = 1 << 3
export const INKLING_FORMAT_CODE = 1 << 4

export function hasInklingFormat(format: number | undefined, flag: number): boolean {
  return ((format ?? 0) & flag) !== 0
}
