import { describe, expect, it } from 'vitest'

import { buildInklingCardMenu } from '@/ui/inkling/editor/cards/card-registry'

describe('ui/inkling/editor/cards/card-registry', () => {
  it('article menu includes image, code, math, music, solution, twoColumn, table, and horizontal-rule', () => {
    const menu = buildInklingCardMenu('article')
    const types = menu.flatMap((section) => section.items.map((item) => item.type))
    expect(types).toContain('image-card')
    expect(types).toContain('code-block')
    expect(types).toContain('math-block')
    expect(types).toContain('music-card')
    expect(types).toContain('solution')
    expect(types).toContain('two-column')
    expect(types).toContain('table')
    expect(types).toContain('horizontal-rule')
  })

  it('comment menu does not include article-only cards', () => {
    const menu = buildInklingCardMenu('comment')
    const types = menu.flatMap((section) => section.items.map((item) => item.type))
    expect(types).not.toContain('image-card')
    expect(types).not.toContain('music-card')
    expect(types).not.toContain('table')
    expect(types).not.toContain('horizontal-rule')
    expect(types).not.toContain('solution')
    expect(types).not.toContain('two-column')
  })

  it('comment menu keeps rich-text cards that are allowed in comments', () => {
    const menu = buildInklingCardMenu('comment')
    const types = menu.flatMap((section) => section.items.map((item) => item.type))
    expect(types).toContain('code-block')
    expect(types).toContain('math-block')
  })

  it('groups article menu items into sections', () => {
    const menu = buildInklingCardMenu('article')
    const sections = menu.map((section) => section.section)
    expect(sections.length).toBeGreaterThan(0)
    expect(new Set(sections).size).toBe(sections.length)
  })
})
