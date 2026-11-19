export function createHeadingIdTracker(): (base: string) => string {
  const usedIdAttributes: Record<string, number> = {}
  return (base) => {
    const seen = usedIdAttributes[base]
    if (seen === undefined) {
      usedIdAttributes[base] = 1
      return base
    }
    usedIdAttributes[base] = seen + 1
    return `${base}-${seen}`
  }
}
