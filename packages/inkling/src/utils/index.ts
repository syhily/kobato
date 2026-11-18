// The public utils barrel: membership is enumerated, never `export *`, so a new helper
// cannot leak into the public API by accident.
//
// Host utilities: framework-free helpers a host reaches for when wiring the editor into
// a product.
export { DEFAULT_INKLING_VERSION, default as slugify, isLegacyVersion } from '@kobato/inkling-internal/utils/slugify'
export type { SlugifyOptions } from '@kobato/inkling-internal/utils/slugify'
export { default as countWords } from '@kobato/inkling-internal/utils/countWords'
export type { SafeStringLike } from '@kobato/inkling-internal/utils/countWords'
export { Color, textColorForBackgroundColor } from '@kobato/inkling-internal/utils/colorUtils'
export type { ColorInstance } from '@kobato/inkling-internal/utils/colorUtils'
export { debounce, throttle } from '@kobato/inkling-internal/utils/timing'
export type { DebouncedFunction, DebounceOptions } from '@kobato/inkling-internal/utils/timing'
export { escapeRegExp, kebabCase, pick } from '@kobato/inkling-internal/utils/objects'
export {
  CARD_WIDTHS,
  isCardWidth,
  normalizeCardWidth,
  type CardWidth,
} from '@kobato/inkling-internal/nodes/base/utils/card-widths'
//
// Lexical editor primitives: $-prefixed state readers and DOM helpers for hosts writing
// their own behaviour-layer commands.
export { $isAtStartOfDocument } from '@kobato/inkling-internal/utils/$isAtStartOfDocument'
export { $selectDecoratorNode } from '@kobato/inkling-internal/utils/$selectDecoratorNode'
export { $isAtTopOfNode } from '@kobato/inkling-internal/utils/$isAtTopOfNode'
export { getTopLevelNativeElement } from '@kobato/inkling-internal/utils/getTopLevelNativeElement'
