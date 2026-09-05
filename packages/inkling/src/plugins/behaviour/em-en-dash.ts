// The em/en dash replacement grammar — the scan body EmEnDashPlugin wires
// into the update-scan seam (@/plugins/behaviour/update-scan). Pure text
// policy over dirty leaves, with zero DOM: right-to-left scan, boundary
// guards, the HR-shortcut exemption, and caret offset adjustment. Kept
// headless so the grammar can be pinned as a synchronous test table
// (test/unit/plugins/behaviour/em-en-dash.test.ts).

import { $getNodeByKey, $getSelection, $isRangeSelection, $isTextNode } from 'lexical'

const DASH = '-'
const EM_DASH = '—'
const EN_DASH = '–'

export function $replaceDashes(dirtyLeaves: Set<string>, supportsHrShortcut: boolean) {
  const selection = $getSelection()
  const isCollapsedRange = $isRangeSelection(selection) && selection.isCollapsed()
  const anchorNode = isCollapsedRange ? selection.anchor.getNode() : null
  const originalAnchorOffset = isCollapsedRange ? selection.anchor.offset : null

  let totalOffsetAdjustment = 0

  dirtyLeaves.forEach((key) => {
    const node = $getNodeByKey(key)
    if (!$isTextNode(node)) {
      return
    }

    let text = node.getTextContent()

    // '---' as the sole content of a paragraph is the horizontal-rule
    // card shortcut - leave it alone so the seam's HR trigger can fire
    // (@/markdown/card-shortcuts)
    if (supportsHrShortcut && text === '---' && node.getParent()?.getTextContent() === '---') {
      return
    }

    let replaced = false
    let i = text.length

    while (i >= 3) {
      // em dash: three consecutive dashes, not preceded or followed by a dash
      if (
        text.slice(i - 3, i) === '---' &&
        (i - 4 < 0 || text[i - 4] !== DASH) &&
        (i === text.length || text[i] !== DASH)
      ) {
        if (isCollapsedRange && anchorNode === node && originalAnchorOffset !== null && originalAnchorOffset >= i) {
          totalOffsetAdjustment += 2
        }

        text = text.slice(0, i - 3) + EM_DASH + text.slice(i)
        node.setTextContent(text)
        replaced = true
        i -= 3
        continue
      }

      // en dash: non-dash char + '--' + whitespace ending at i
      if (
        i >= 3 &&
        text.slice(i - 3, i - 1) === '--' &&
        /^\s$/.test(text[i - 1]) &&
        i - 4 >= 0 &&
        text[i - 4] !== DASH
      ) {
        if (isCollapsedRange && anchorNode === node && originalAnchorOffset !== null && originalAnchorOffset >= i) {
          totalOffsetAdjustment += 1
        }

        text = text.slice(0, i - 3) + EN_DASH + text.slice(i - 1)
        node.setTextContent(text)
        replaced = true
        i -= 3
        continue
      }

      i -= 1
    }

    if (replaced && isCollapsedRange && anchorNode === node && originalAnchorOffset !== null) {
      const newOffset = originalAnchorOffset - totalOffsetAdjustment
      selection.anchor.offset = newOffset
      selection.focus.offset = newOffset
    }
  })
}
