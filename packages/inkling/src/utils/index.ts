// The public utils barrel: membership is enumerated, never `export *`, so a new helper
// cannot leak into the public API by accident.
//
// Host utilities: framework-free helpers a host reaches for when wiring the editor into
// a product.
export { DEFAULT_INKLING_VERSION, default as slugify, isLegacyVersion } from './slugify'
export type { SlugifyOptions } from './slugify'
export { default as countWords } from './countWords'
export type { SafeStringLike } from './countWords'
export { Color, textColorForBackgroundColor } from './colorUtils'
export type { ColorInstance } from './colorUtils'
export { debounce, throttle } from './timing'
export type { DebouncedFunction, DebounceOptions } from './timing'
export { escapeRegExp, kebabCase, pick } from './objects'
export { CARD_WIDTHS, isCardWidth, normalizeCardWidth, type CardWidth } from '../nodes/base/utils/card-widths'
//
// Lexical editor primitives: $-prefixed state readers and DOM helpers for hosts writing
// their own behaviour-layer commands.
export { $isAtStartOfDocument } from './$isAtStartOfDocument'
export { $selectDecoratorNode } from './$selectDecoratorNode'
export { $isAtTopOfNode } from './$isAtTopOfNode'
export { getTopLevelNativeElement } from './getTopLevelNativeElement'
