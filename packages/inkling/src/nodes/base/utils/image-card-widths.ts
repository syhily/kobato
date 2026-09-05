import { CARD_WIDTHS, isCardWidth, type CardWidth } from '@/nodes/base/utils/card-widths'

export function getAllowedImageCardWidths(configuredWidths: string[] | undefined | null): CardWidth[] {
  if (!Array.isArray(configuredWidths)) {
    return [...CARD_WIDTHS]
  }

  const filteredWidths = [...new Set(configuredWidths.filter(isCardWidth))]

  if (filteredWidths.length === 0) {
    return [...CARD_WIDTHS]
  }

  return filteredWidths
}

export function getDefaultImageCardWidth(allowedWidths: CardWidth[]): CardWidth {
  if (allowedWidths.includes('regular')) {
    return 'regular'
  }

  return allowedWidths[0] ?? 'regular'
}
