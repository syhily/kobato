export interface SafeStringLike {
  string: string
}

const segmenters = new Map<string, Intl.Segmenter>()

function getSegmenter(language: string): Intl.Segmenter | undefined {
  if (Intl?.Segmenter === undefined) {
    return undefined
  }
  let segmenter = segmenters.get(language)
  if (!segmenter) {
    segmenter = new Intl.Segmenter(language, { granularity: 'word' })
    segmenters.set(language, segmenter)
  }
  return segmenter
}

export default function countWords(text: string | SafeStringLike | null | undefined, language?: string): number {
  if (!text) {
    return 0
  }

  let normalizedText = typeof text === 'string' ? text : text.string

  normalizedText = normalizedText.replace(/<("[^"]*"|'[^']*'|[^'">])+\/?>/g, ' ')

  const segmenter = language ? getSegmenter(language) : undefined
  if (segmenter) {
    let count = 0
    for (const segment of segmenter.segment(normalizedText)) {
      if (segment.isWordLike) {
        count += 1
      }
    }
    return count
  }

  const pattern =
    /[a-zA-ZÀ-ÿ0-9_\u0392-\u03c9\u0410-\u04F9]+|[\u4E00-\u9FFF\u3400-\u4dbf\uf900-\ufaff\u3040-\u309f\uac00-\ud7af]+/g

  const RTLPattern = /([\u0600-\u06ff]+|[\u0591-\u05F4]+)/g

  const match = [...(normalizedText.match(pattern) ?? []), ...(normalizedText.match(RTLPattern) ?? [])]

  let count = 0

  if (match.length === 0) {
    return count
  }

  for (let i = 0; i < match.length; i += 1) {
    if (match[i].charCodeAt(0) >= 0x4e00) {
      count += match[i].length
    } else {
      count += 1
    }
  }

  return count
}
