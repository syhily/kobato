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
    // negative lookbehind isn't supported before Safari 16.4
    // so we capture the preceding char and test it here
    if (match[1] && match[1].trim() && WORD_CHAR_REGEX.test(match[1]) && match[2].slice(0, 1) !== '—') {
      return false
    }

    // we also check any following char in code to avoid an overly
    // complex regex when looking for word-chars following the optional
    // trailing symbol char
    if (match[4] && match[4].trim() && WORD_CHAR_REGEX.test(match[4]) && match[2].slice(-1) !== '—') {
      return false
    }

    return true
  }

  // our regex will match invalid TKs because we can't use negative lookbehind
  // so we need to loop through the matches discarding any that are invalid
  // and keeping track of the original input so we have correct offsets
  // when we find a valid match
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
