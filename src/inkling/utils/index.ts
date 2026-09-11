// The public utils barrel, in two families — membership is enumerated (never
// `export *`) so a new helper can't leak into the public API by accident:
//
// Host utilities (merged from @inkling/utils): framework-free helpers a host
// reaches for when wiring the editor into a product.
export { DEFAULT_INKLING_VERSION, default as slugify, isLegacyVersion } from '@/inkling/utils/slugify'
export type { SlugifyOptions } from '@/inkling/utils/slugify'
export { default as countWords } from '@/inkling/utils/countWords'
export type { SafeStringLike } from '@/inkling/utils/countWords'
export { Color, textColorForBackgroundColor } from '@/inkling/utils/colorUtils'
export type { ColorInstance } from '@/inkling/utils/colorUtils'
export { debounce, throttle } from '@/inkling/utils/timing'
export type { DebouncedFunction, DebounceOptions } from '@/inkling/utils/timing'
export { escapeRegExp, kebabCase, pick } from '@/inkling/utils/objects'
export { CARD_WIDTHS, isCardWidth, normalizeCardWidth, type CardWidth } from '@/inkling/nodes/base/utils/card-widths'
//
// Lexical editor primitives: $-prefixed state readers and DOM helpers for
// hosts writing their own behaviour-layer commands.
export { $isAtStartOfDocument } from '@/inkling/utils/$isAtStartOfDocument'
export { $selectDecoratorNode } from '@/inkling/utils/$selectDecoratorNode'
export { $isAtTopOfNode } from '@/inkling/utils/$isAtTopOfNode'
export { getTopLevelNativeElement } from '@/inkling/utils/getTopLevelNativeElement'
