// The public utils barrel, in two families — membership is enumerated (never
// `export *`) so a new helper can't leak into the public API by accident:
//
// Host utilities (merged from @inkling/utils): framework-free helpers a host
// reaches for when wiring the editor into a product.
export { DEFAULT_INKLING_VERSION, default as slugify, isLegacyVersion } from '@/utils/slugify'
export type { SlugifyOptions } from '@/utils/slugify'
export { default as countWords } from '@/utils/countWords'
export type { SafeStringLike } from '@/utils/countWords'
export { Color, textColorForBackgroundColor } from '@/utils/colorUtils'
export type { ColorInstance } from '@/utils/colorUtils'
export { debounce, throttle } from '@/utils/timing'
export type { DebouncedFunction, DebounceOptions } from '@/utils/timing'
export { escapeRegExp, kebabCase, pick } from '@/utils/objects'
export { CARD_WIDTHS, isCardWidth, normalizeCardWidth, type CardWidth } from '@/nodes/base/utils/card-widths'
//
// Lexical editor primitives: $-prefixed state readers and DOM helpers for
// hosts writing their own behaviour-layer commands.
export { $isAtStartOfDocument } from '@/utils/$isAtStartOfDocument'
export { $selectDecoratorNode } from '@/utils/$selectDecoratorNode'
export { $isAtTopOfNode } from '@/utils/$isAtTopOfNode'
export { getTopLevelNativeElement } from '@/utils/getTopLevelNativeElement'
