const VALID_IMAGE_CARD_WIDTHS: string[] = ['regular', 'wide', 'full']

export function getAllowedImageCardWidths(configuredWidths: string[] | undefined | null): string[] {
  if (!Array.isArray(configuredWidths)) {
    return VALID_IMAGE_CARD_WIDTHS
  }

  const filteredWidths = [...new Set(configuredWidths.filter((width) => VALID_IMAGE_CARD_WIDTHS.includes(width)))]

  if (filteredWidths.length === 0) {
    return VALID_IMAGE_CARD_WIDTHS
  }

  return filteredWidths
}

export function getDefaultImageCardWidth(allowedWidths: string[]): string {
  if (allowedWidths.includes('regular')) {
    return 'regular'
  }

  return allowedWidths[0] ?? 'regular'
}
