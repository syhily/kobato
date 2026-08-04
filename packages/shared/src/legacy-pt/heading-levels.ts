import type { StandardBlockStyle } from '@kobato/shared/legacy-pt/schema'

// Single owner of the heading style ↔ level mapping, schema-adjacent so
// both the bridge (`pt-to-pm` heading emission) and the heading-slot
// collector (`@/shared/pt/utils`) read the same table.

export function headingLevelFromStyle(style: StandardBlockStyle | undefined): number | null {
  switch (style) {
    case 'h1':
      return 1
    case 'h2':
      return 2
    case 'h3':
      return 3
    case 'h4':
      return 4
    case 'blockquote':
    case 'normal':
    case undefined:
      return null
  }
}

export function headingStyleFromLevel(level: number): StandardBlockStyle {
  switch (level) {
    case 1:
      return 'h1'
    case 2:
      return 'h2'
    case 3:
      return 'h3'
    case 4:
      return 'h4'
    default:
      return 'h4'
  }
}
