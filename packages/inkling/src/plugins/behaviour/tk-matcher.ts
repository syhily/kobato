// Pure TK entity matcher behind TKPlugin: offset arithmetic over the TK regex
// plus the invalid-match skip loop that works around the missing negative
// lookbehind on Safari < 16.4. Wired into the editor via useInklingTextEntity;
// kept pure so the offset table is a data-driven unit suite.

const REGEX = /(^|.)([^\p{L}\p{N}\s]*(TK|Tk|tk)+[^\p{L}\p{N}\s]*)(.)?/u
const WORD_CHAR_REGEX = /\p{L}|\p{N}/u

export function getTKMatch(initialText: string): { start: number; end: number } | null {
  let text = initialText
  let matchArr = REGEX.exec(text)

  if (matchArr === null) {
    return null
  }

  function isValidMatch(match: RegExpExecArray) {
    // No negative lookbehind before Safari 16.4: capture the preceding char
    // and test it here instead.
    if (match[1]?.trim() && WORD_CHAR_REGEX.test(match[1]) && match[2].slice(0, 1) !== '—') {
      return false
    }

    // Test the following char in code rather than complicate the regex.
    if (match[4]?.trim() && WORD_CHAR_REGEX.test(match[4]) && match[2].slice(-1) !== '—') {
      return false
    }

    return true
  }

  // The regex matches invalid TKs (no negative lookbehind), so loop and
  // discard them, tracking the consumed text for correct offsets.
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
