// The smart-typography replacement grammar — the scan body TypographyPlugin
// wires into the update-scan seam (@/plugins/behaviour/update-scan), next to
// EmEnDashPlugin's dash grammar. Pure text policy over dirty leaves, with
// zero DOM, kept headless so the rule set is pinned as a synchronous test
// table (test/unit/plugins/behaviour/typography.test.ts).
//
// The rule set aligns with tiptap's extension-typography DEFAULTS (v3.31:
// ellipsis, open/close double/single quotes, left/right arrows, copyright,
// trademark, servicemark, registeredTrademark, oneHalf, plusMinus, notEqual,
// laquo, raquo, multiplication, superscriptTwo/Three, oneQuarter,
// threeQuarters) with one deliberate exception: tiptap's emDash rule
// ('--' → '—' on the keystroke) is NOT re-implemented here — inkling's dash
// policy already lives in @/plugins/behaviour/em-en-dash ('---' → em dash,
// '--' + whitespace → en dash) and the two grammars would fight over '--'.
//
// Two structural differences from tiptap's input rules fall out of the scan
// model, both pinned in the test table:
//
// - The scan sees the whole dirty text node, not one trailing keystroke, so
//   each rule replaces EVERY match in the node, not just the caret-end one.
//   Per-keystroke typing still converges to tiptap's result because the scan
//   re-runs after every commit.
// - Smart-quote direction reads the preceding character of the REPLACED text
//   (built left to right), which reproduces tiptap's open-quote context class
//   incrementally: start-of-text or one of [\s{[(<'"‘“] opens, anything else
//   closes.
//
// No code-block guard: the package's node sets register no CodeNode (code is
// a CodeMirror card — its text never becomes Lexical text nodes), so dirty
// leaves are never code content. IME composition protection is not here
// either — it lives in the update-scan seam's composing skip, shared with
// EmEnDash and HorizontalRule.

import { $getNodeByKey, $getSelection, $isRangeSelection, $isTextNode } from 'lexical'

// tiptap's open-quote context class: (?:^|[\s{[(<'"\u2018\u201C])
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

// Replacement order follows tiptap's buildInputRules order (minus emDash).
// Every replacement is a character its own pattern cannot match, so the
// bounded re-run below converges; the re-run exists for cascading matches
// one global pass cannot see ('2x3x4' — the first match consumes the middle
// digit the second match needs; per-keystroke typing never hits this because
// the scan re-runs after every commit).
const PATTERN_RULES: readonly PatternRule[] = [
  // ellipsis: '...' → '…' (a 4+ dot run sheds one leading group of three per
  // pass, matching per-keystroke semantics: '....' → '….')
  { pattern: /(^|[^.])\.{3}/g, replace: (m) => m[1] + '…' },
  // leftArrow / rightArrow
  { pattern: /<-/g, replace: () => '←' },
  { pattern: /->/g, replace: () => '→' },
  // copyright / trademark / servicemark / registeredTrademark — lowercase
  // only, tiptap parity ('(C)' stays literal)
  { pattern: /\((?:c|tm|sm|r)\)/g, replace: (m) => MARKS[m[0]] },
  // oneHalf / oneQuarter / threeQuarters — tiptap requires a start/whitespace
  // boundary before and trailing whitespace after
  { pattern: /(^|\s)(1\/2|1\/4|3\/4)(?=\s)/g, replace: (m) => m[1] + FRACTIONS[m[2]] },
  // plusMinus
  { pattern: /\+\/-/g, replace: () => '±' },
  // notEqual
  { pattern: /!=/g, replace: () => '≠' },
  // laquo / raquo
  { pattern: /<</g, replace: () => '«' },
  { pattern: />>/g, replace: () => '»' },
  // multiplication — replaces only the '*'/'x' between digits
  { pattern: /(\d\s?)[*x](?=\s?\d)/g, replace: (m) => m[1] + '×' },
  // superscriptTwo / superscriptThree
  { pattern: /\^2/g, replace: () => '²' },
  { pattern: /\^3/g, replace: () => '³' },
]

const MAX_RULE_PASSES = 4

// Applies one pattern rule to `text` until it stops matching (bounded),
// returning the new text and the total character shrink before `caret`.
// Matches within one pass never overlap (exec advances past each match), so
// right-to-left application keeps the earlier spans valid.
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

// Smart quotes are 1:1 replacements, so they never move the caret. Direction
// reads the already-replaced prefix, reproducing tiptap's open/close context
// class keystroke by keystroke.
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
    // Quotes run first so their 1:1 replacements cannot disturb the span
    // arithmetic of the shrinking rules; direction context is unaffected
    // (no quote char participates in any pattern rule).
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
