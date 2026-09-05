// The card stories' display-state vocabulary — the one home of the
// Default/Selected/Editing map and the Storybook radio argType that every
// card story used to hand-copy (~25 lines × 13 stories). A story declares
// `display?: CardDisplayKey` in its args, resolves the state with
// CARD_DISPLAY_OPTIONS[display], and wires `display: cardDisplayArgType()`
// into its argTypes; the render shell stays per-story because the card
// layouts genuinely diverge.

export const CARD_DISPLAY_OPTIONS = {
  Default: { isSelected: false, isEditing: false },
  Selected: { isSelected: true, isEditing: false },
  Editing: { isSelected: true, isEditing: true },
} as const

export type CardDisplayKey = keyof typeof CARD_DISPLAY_OPTIONS

export type CardDisplayState = (typeof CARD_DISPLAY_OPTIONS)[CardDisplayKey]

/** The display radio argType, restricted to the states the card has (a card without an edit mode passes a subset). */
export function cardDisplayArgType(keys: readonly CardDisplayKey[] = ['Default', 'Selected', 'Editing']) {
  const mapping = Object.fromEntries(keys.map((key) => [key, CARD_DISPLAY_OPTIONS[key]]))
  return {
    options: [...keys],
    mapping,
    control: {
      type: 'radio' as const,
      labels: Object.fromEntries(keys.map((key) => [key, key])),
      defaultValue: CARD_DISPLAY_OPTIONS.Default,
    },
  }
}
