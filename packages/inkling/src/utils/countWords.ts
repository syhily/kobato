/**
 * Word count Utility
 * @param text - text to count words in
 * @returns word count
 * @description Takes a string and returns the number of words after sanitizing any html.
 * This code is taken from https://github.com/sparksuite/simplemde-markdown-editor/blob/6abda7ab68cc20f4aca870eb243747951b90ab04/src/js/simplemde.js#L1054-L1067
 * with extra diacritics character matching.
 **/
export interface SafeStringLike {
  string: string
}

// Segmenter path: when the caller names a
// language and the runtime provides Intl.Segmenter, word-granularity segments
// counted by `isWordLike` give dictionary-aware counts for CJK text (the
// regex fallback below counts every CJK character as one word). One segmenter
// per language is cached at module level — construction reads locale data and
// is not cheap. The availability check runs per call, before the cache read,
// so a runtime without Segmenter always falls through to the regex path.
const segmenters = new Map<string, Intl.Segmenter>()

function getSegmenter(language: string): Intl.Segmenter | undefined {
  if (typeof Intl === 'undefined' || typeof Intl.Segmenter === 'undefined') {
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

  normalizedText = normalizedText.replace(/<("[^"]*"|'[^']*'|[^'">])+\/?>/g, ' ') // strip any HTML tags

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

  // Both patterns must run: a text mixing e.g. Latin and Arabic matches both,
  // and picking only the first hit would drop every RTL word.
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
