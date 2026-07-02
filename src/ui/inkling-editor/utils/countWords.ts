/**
 * Word count Utility
 * @param text - text to count words in
 * @returns word count
 // oxlint-disable-next-line typescript/no-explicit-any
 * @description Takes a string and returns the number of words after sanitizing any html.
 * This code is taken from https://github.com/sparksuite/simplemde-markdown-editor/blob/6abda7ab68cc20f4aca870eb243747951b90ab04/src/js/simplemde.js#L1054-L1067
 * with extra diacritics character matching.
 **/
export default function countWords(text: string | { string: string } | null | undefined): number {
  if (!text) {
    return 0
  }

  let normalizedText: string

  // protect against Handlebars.SafeString
  if (typeof text !== 'string' && Object.prototype.hasOwnProperty.call(text, 'string')) {
    normalizedText = text.string
  } else {
    normalizedText = text as string
  }

  normalizedText = normalizedText.replace(/<("[^"]*"|'[^']*'|[^'">])+\/?>/g, ' ') // strip any HTML tags

  const pattern =
    /[a-zA-ZÀ-ÿ0-9_\u0392-\u03c9\u0410-\u04F9]+|[\u4E00-\u9FFF\u3400-\u4dbf\uf900-\ufaff\u3040-\u309f\uac00-\ud7af]+/g

  const RTLPattern = /([\u0600-\u06ff]+|[\u0591-\u05F4]+)/g

  const match = normalizedText.match(pattern) || normalizedText.match(RTLPattern)

  let count = 0

  if (match === null) {
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
