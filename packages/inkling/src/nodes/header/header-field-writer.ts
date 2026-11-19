import type { BaseHeaderNode } from '@kobato/inkling-internal/nodes/base/nodes/header/HeaderNode'

export type HeaderNodeWriter = (update: (node: BaseHeaderNode) => void) => void

type HeaderStringField = 'alignment' | 'backgroundSize' | 'buttonText' | 'buttonUrl' | 'layout' | 'textColor'

type HeaderToggleField = 'buttonEnabled' | 'swapped'

type HeaderColorPairField = 'backgroundColor' | 'buttonColor'
type HeaderPairTextColorField = 'buttonTextColor' | 'textColor'

export function headerFieldWriter(write: HeaderNodeWriter) {
  return {
    set:
      <K extends HeaderStringField>(field: K) =>
      (value: BaseHeaderNode[K]) =>
        write((node) => {
          node[field] = value
        }),

    toggle: (field: HeaderToggleField, current: boolean) => (): void =>
      write((node) => {
        node[field] = !current
      }),

    setColorPair:
      (colorField: HeaderColorPairField, textColorField: HeaderPairTextColorField) =>
      (color: string, matchingTextColor: string): void =>
        write((node) => {
          node[colorField] = color
          node[textColorField] = matchingTextColor
        }),

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
