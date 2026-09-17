import { createCanvas } from '@napi-rs/canvas'
import { describe, expect, it } from 'vitest'

import { layoutCanvasLines } from '@/server/render/pretext-layout'

const ctx = createCanvas(1, 1).getContext('2d')
const FONT = '32px serif'

// Punctuation that must never open a line under CJK kinsoku rules.
const LINE_START_FORBIDDEN = /^[，。！？；：、）】》」』”’…—·]/

describe('render/pretext-layout — layoutCanvasLines', () => {
  it('never starts a line with CJK closing punctuation across a width sweep', () => {
    const text = '春眠不觉晓，处处闻啼鸟。夜来风雨声，花落知多少。欲穷千里目，更上一层楼！'
    for (let width = 80; width <= 480; width += 16) {
      const lines = layoutCanvasLines(ctx, text, FONT, width, 99)
      for (const line of lines) {
        expect(line, `width=${width}`).not.toMatch(LINE_START_FORBIDDEN)
      }
    }
  })

  it('keeps Latin words intact when wrapping', () => {
    const words = ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta']
    const lines = layoutCanvasLines(ctx, words.join(' '), FONT, 200, 99)
    expect(lines.length).toBeGreaterThan(1)
    for (const line of lines) {
      const lineWords = line.split(' ')
      for (const word of lineWords) {
        expect(words).toContain(word)
      }
    }
  })

  it('returns short text unwrapped and untouched', () => {
    expect(layoutCanvasLines(ctx, '你好，世界。', FONT, 600, 3)).toEqual(['你好，世界。'])
  })

  it('returns no lines for empty text', () => {
    expect(layoutCanvasLines(ctx, '', FONT, 600, 3)).toEqual([])
  })

  it('clamps to maxLines and ellipsizes the last line within the width budget', () => {
    const text = '很长的一段引文。'.repeat(40)
    const maxWidth = 300
    const lines = layoutCanvasLines(ctx, text, FONT, maxWidth, 3)

    expect(lines).toHaveLength(3)
    expect(lines[2].endsWith('…')).toBe(true)
    expect(lines[2]).not.toMatch(/[，、；：。,.;:!?！？]…$/)
    ctx.font = FONT
    for (const line of lines) {
      expect(ctx.measureText(line).width).toBeLessThanOrEqual(maxWidth)
    }
  })

  it('does not ellipsize when the text fits within maxLines', () => {
    const lines = layoutCanvasLines(ctx, '短引文。', FONT, 600, 3)
    expect(lines).toEqual(['短引文。'])
  })

  it('collapses embedded newlines instead of spraying them onto the card', () => {
    const lines = layoutCanvasLines(ctx, '第一行\n第二行', FONT, 600, 3)
    expect(lines).toEqual(['第一行 第二行'])
  })
})
