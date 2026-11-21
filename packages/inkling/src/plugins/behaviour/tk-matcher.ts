const REGEX = /(^|.)([^\p{L}\p{N}\s]*(TK|Tk|tk)+[^\p{L}\p{N}\s]*)(.)?/u
const WORD_CHAR_REGEX = /\p{L}|\p{N}/u

export function getTKMatch(initialText: string): { start: number; end: number } | null {
  let text = initialText
  let matchArr = REGEX.exec(text)

  if (matchArr === null) {
    return null
  }

  function isValidMatch(match: RegExpExecArray) {
    if (match[1]?.trim() && WORD_CHAR_REGEX.test(match[1]) && match[2].slice(0, 1) !== '—') {
      return false
    }

    if (match[4]?.trim() && WORD_CHAR_REGEX.test(match[4]) && match[2].slice(-1) !== '—') {
      return false
    }

    return true
  }

  let textBeforeMatch = ''

  while (matchArr !== null && !isValidMatch(matchArr)) {
    textBeforeMatch += text.slice(0, matchArr.index + matchArr[0].length - 1)
    text = text.slice(matchArr.index + matchArr[0].length - 1)
    matchArr = REGEX.exec(text)
  }

  if (matchArr === null) {
    return null
  }

  const offsetAdjustment = textBeforeMatch.length

  const startOffset = offsetAdjustment + matchArr.index + matchArr[1].length
  const endOffset = startOffset + matchArr[2].length

  return {
    end: endOffset,
    start: startOffset,
  }
}
