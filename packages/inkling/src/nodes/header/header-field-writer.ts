import type { BaseHeaderNode } from '@/nodes/base/nodes/header/HeaderNode'

/** The card write seam's `write(mutator)` signature, narrowed to the header node. */
export type HeaderNodeWriter = (update: (node: BaseHeaderNode) => void) => void

/** The string-valued node fields the header chrome writes verbatim. */
type HeaderStringField = 'alignment' | 'backgroundSize' | 'buttonText' | 'buttonUrl' | 'layout' | 'textColor'

/** The boolean node fields the header chrome toggles off their current value. */
type HeaderToggleField = 'buttonEnabled' | 'swapped'

/** The color node fields written as a (color, matchingTextColor) pair. */
type HeaderColorPairField = 'backgroundColor' | 'buttonColor'
type HeaderPairTextColorField = 'buttonTextColor' | 'textColor'

/**
 * Field-name-as-data write handlers over the card write seam (CONTEXT.md
 * "card write seam"): the header component's copied
 * `handleX = (v) => write((node) => { node.x = v })` handlers collapse into
 * these factories — the field names are the only variance, and the closed
 * literal unions keep them constrained to the node's writable fields (an
 * unknown field is a compile error).
 */
export function headerFieldWriter(write: HeaderNodeWriter) {
  return {
    /** `(value) => node[field] = value` for the string-valued fields. */
    set:
      <K extends HeaderStringField>(field: K) =>
      (value: BaseHeaderNode[K]) =>
        write((node) => {
          node[field] = value
        }),

    /** `() => node[field] = !current` for the boolean toggles. */
    toggle: (field: HeaderToggleField, current: boolean) => (): void =>
      write((node) => {
        node[field] = !current
      }),

    /** `(color, matchingTextColor)` writes the color field plus its matching text color. */
    setColorPair:
      (colorField: HeaderColorPairField, textColorField: HeaderPairTextColorField) =>
      (color: string, matchingTextColor: string): void =>
        write((node) => {
          node[colorField] = color
          node[textColorField] = matchingTextColor
        }),

    /** Input-blur policy: an emptied input snaps the field back to its fallback. */
    blurFallback:
      (field: 'buttonText' | 'buttonUrl', fallback: string) =>
      (event: React.FocusEvent<HTMLInputElement>): void => {
        if (!event.target.value) {
          write((node) => {
            node[field] = fallback
          })
        }
      },
  }
}
