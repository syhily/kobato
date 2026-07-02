// Nested editor / caption editor markers appended to keyboard events
export interface NestedKeyboardEvent extends KeyboardEvent {
  _fromNested?: boolean
  _fromCaptionEditor?: boolean
}
