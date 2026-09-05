import type { StandardBlockStyle } from '@/shared/pt/schema'

// LEGACY (R14): retained for `@/shared/pt/utils` and the R15 backfill's
// per-row conversion only.
//
// Single owner of the heading style ↔ level mapping, schema-adjacent so
// the heading-slot collector (`@/shared/pt/utils`) reads the same table.

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
