import { $getNodeByKey, $getSelection, $isRangeSelection, $isTextNode } from 'lexical'

const OPEN_QUOTE_PRECEDER = /[\s{[(<'"‘“]/

const FRACTIONS: Readonly<Record<string, string>> = {
  '1/2': '½',
  '1/4': '¼',
  '3/4': '¾',
}

const MARKS: Readonly<Record<string, string>> = {
  '(c)': '©',
  '(tm)': '™',
  '(sm)': '℠',
  '(r)': '®',
}

interface PatternRule {
  pattern: RegExp
  replace: (match: RegExpExecArray) => string
}

const PATTERN_RULES: readonly PatternRule[] = [
  { pattern: /(^|[^.])\.{3}/g, replace: (m) => m[1] + '…' },

  { pattern: /<-/g, replace: () => '←' },
  { pattern: /->/g, replace: () => '→' },

  { pattern: /\((?:c|tm|sm|r)\)/g, replace: (m) => MARKS[m[0]] },
  { pattern: /(^|\s)(1\/2|1\/4|3\/4)(?=\s)/g, replace: (m) => m[1] + FRACTIONS[m[2]] },
  { pattern: /\+\/-/g, replace: () => '±' },

  { pattern: /!=/g, replace: () => '≠' },

  { pattern: /<</g, replace: () => '«' },
  { pattern: />>/g, replace: () => '»' },
  { pattern: /(\d\s?)[*x](?=\s?\d)/g, replace: (m) => m[1] + '×' },

  { pattern: /\^2/g, replace: () => '²' },
  { pattern: /\^3/g, replace: () => '³' },
]

const MAX_RULE_PASSES = 4

function applyPatternRule(
  input: string,
  caret: number | null,
  { pattern, replace }: PatternRule,
): { text: string; caretAdjustment: number } {
  let text = input
  let caretAdjustment = 0

  for (let pass = 0; pass < MAX_RULE_PASSES; pass++) {
    const matches: Array<{ start: number; end: number; replacement: string }> = []
    pattern.lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = pattern.exec(text)) !== null) {
      matches.push({ start: match.index, end: match.index + match[0].length, replacement: replace(match) })
      if (match[0].length === 0) {
        pattern.lastIndex += 1
      }
    }
    if (matches.length === 0) {
      break
    }

    const currentCaret = caret === null ? null : caret - caretAdjustment
    for (let i = matches.length - 1; i >= 0; i--) {
      const { start, end, replacement } = matches[i]
      text = text.slice(0, start) + replacement + text.slice(end)
      if (currentCaret !== null && currentCaret >= end) {
        caretAdjustment += end - start - replacement.length
      }
    }
  }

  return { text, caretAdjustment }
}

function replaceSmartQuotes(text: string): string {
  let result = ''
  for (const char of text) {
    if (char === '"' || char === "'") {
      const previous = result[result.length - 1]
      const isOpen = previous === undefined || OPEN_QUOTE_PRECEDER.test(previous)
      result += char === '"' ? (isOpen ? '“' : '”') : isOpen ? '‘' : '’'
    } else {
      result += char
    }
  }
  return result
}

export function $replaceTypography(dirtyLeaves: Set<string>) {
  const selection = $getSelection()
  const isCollapsedRange = $isRangeSelection(selection) && selection.isCollapsed()
  const anchorNode = isCollapsedRange ? selection.anchor.getNode() : null
  const originalAnchorOffset = isCollapsedRange ? selection.anchor.offset : null

  dirtyLeaves.forEach((key) => {
    const node = $getNodeByKey(key)
    if (!$isTextNode(node)) {
      return
    }

    let text = node.getTextContent()
    text = replaceSmartQuotes(text)

    let totalCaretAdjustment = 0
    for (const rule of PATTERN_RULES) {
      const caret = anchorNode === node ? originalAnchorOffset : null
      const applied = applyPatternRule(text, caret === null ? null : caret - totalCaretAdjustment, rule)
      text = applied.text
      totalCaretAdjustment += applied.caretAdjustment
    }

    if (text === node.getTextContent()) {
      return
    }
    node.setTextContent(text)

    if (isCollapsedRange && anchorNode === node && originalAnchorOffset !== null && totalCaretAdjustment !== 0) {
      const newOffset = originalAnchorOffset - totalCaretAdjustment
      selection.anchor.offset = newOffset
      selection.focus.offset = newOffset
    }
  })
}
