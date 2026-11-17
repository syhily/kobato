import type { SKRSContext2D } from '@napi-rs/canvas'

import { layoutWithLines, prepareWithSegments } from '@chenglou/pretext'
import { createCanvas } from '@napi-rs/canvas'

// Pretext measures through the runtime's `OffscreenCanvas`; Node has none, so
// back it with the same skia context the renderers paint with. The shim must
// be installed before the first prepare() call — getMeasureContext() memoizes.
if (globalThis.OffscreenCanvas === undefined) {
  class NapiOffscreenCanvas {
    private readonly canvas = createCanvas(1, 1)

    constructor(
      public readonly width: number,
      public readonly height: number,
    ) {}

    getContext(kind: '2d') {
      return this.canvas.getContext(kind)
    }
  }
  ;(globalThis as Record<string, unknown>).OffscreenCanvas = NapiOffscreenCanvas
}

const ELLIPSIS = '…'
const graphemeSegmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
// Dangling clause/period marks read awkwardly right before an ellipsis.
const TRAILING_PUNCTUATION = new Set([...graphemeSegmenter.segment('，、；：。,.;:!?！？')].map((g) => g.segment))

/**
 * Lay out `text` for a canvas render: pretext does the width-driven line
 * breaking (CJK kinsoku included — closing punctuation never starts a line,
 * Latin words stay intact), and an over-long paragraph is clamped to
 * `maxLines` with a measured ellipsis on the last line.
 */
export function layoutCanvasLines(
  ctx: SKRSContext2D,
  text: string,
  font: string,
  maxWidth: number,
  maxLines: number,
): string[] {
  const prepared = prepareWithSegments(text, font)
  // Line text keeps the space hanging past the wrap point (only its width is
  // excluded) — trim it so the ellipsis never lands after a stray space.
  const lines = layoutWithLines(prepared, maxWidth, 0).lines.map((line) => line.text.trimEnd())
  if (lines.length <= maxLines) {
    return lines
  }

  lines.length = maxLines
  ctx.font = font
  const graphemes = [...graphemeSegmenter.segment(lines[maxLines - 1])].map((g) => g.segment)
  while (graphemes.length > 0 && ctx.measureText(`${graphemes.join('')}${ELLIPSIS}`).width > maxWidth) {
    graphemes.pop()
  }
  while (graphemes.length > 0 && TRAILING_PUNCTUATION.has(graphemes[graphemes.length - 1])) {
    graphemes.pop()
  }
  lines[maxLines - 1] = `${graphemes.join('')}${ELLIPSIS}`
  return lines
}
