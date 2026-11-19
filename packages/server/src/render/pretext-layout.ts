import type { SKRSContext2D } from '@napi-rs/canvas'

import { layoutWithLines, prepareWithSegments } from '@chenglou/pretext'
import { createCanvas } from '@napi-rs/canvas'

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
const TRAILING_PUNCTUATION = new Set([...graphemeSegmenter.segment('，、；：。,.;:!?！？')].map((g) => g.segment))

export function layoutCanvasLines(
  ctx: SKRSContext2D,
  text: string,
  font: string,
  maxWidth: number,
  maxLines: number,
): string[] {
  const prepared = prepareWithSegments(text, font)
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
