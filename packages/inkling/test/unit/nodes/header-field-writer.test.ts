import { describe, expect, it } from 'vitest'

import type { BaseHeaderNode } from '@/nodes/base/nodes/header/HeaderNode'

import { headerFieldWriter, type HeaderNodeWriter } from '@/nodes/header/header-field-writer'

// capture each mutator's effect on a fresh node-shaped record, so the
// write-through mapping stays a synchronous table
function createWriteCapture() {
  const applied: Array<Partial<BaseHeaderNode>> = []
  const write: HeaderNodeWriter = (update) => {
    const node: Partial<BaseHeaderNode> = {}
    update(node as BaseHeaderNode)
    applied.push(node)
  }
  return { applied, write }
}

function blurEvent(value: string): React.FocusEvent<HTMLInputElement> {
  return { target: { value } } as React.FocusEvent<HTMLInputElement>
}

describe('headerFieldWriter', () => {
  describe('set', () => {
    it.each([
      ['alignment', 'center'],
      ['backgroundSize', 'contain'],
      ['buttonText', 'Buy now'],
      ['buttonUrl', 'https://example.com'],
      ['layout', 'split'],
      ['textColor', '#FFFFFF'],
    ] as const)('writes %s through the seam', (field, value) => {
      const { applied, write } = createWriteCapture()

      headerFieldWriter(write).set(field)(value)

      expect(applied).toEqual([{ [field]: value }])
    })
  })

  describe('toggle', () => {
    it('flips the named boolean field off its current value', () => {
      const { applied, write } = createWriteCapture()
      const field = headerFieldWriter(write)

      field.toggle('swapped', false)()
      field.toggle('buttonEnabled', true)()

      expect(applied).toEqual([{ swapped: true }, { buttonEnabled: false }])
    })
  })

  describe('setColorPair', () => {
    it('writes the color field and its matching text color in one mutator', () => {
      const { applied, write } = createWriteCapture()
      const field = headerFieldWriter(write)

      field.setColorPair('backgroundColor', 'textColor')('#000000', '#FFFFFF')
      field.setColorPair('buttonColor', 'buttonTextColor')('#ffffff', '#000000')

      expect(applied).toEqual([
        { backgroundColor: '#000000', textColor: '#FFFFFF' },
        { buttonColor: '#ffffff', buttonTextColor: '#000000' },
      ])
    })
  })

  describe('blurFallback', () => {
    it('writes the fallback when the input was emptied', () => {
      const { applied, write } = createWriteCapture()
      const field = headerFieldWriter(write)

      field.blurFallback('buttonText', '')(blurEvent(''))
      field.blurFallback('buttonUrl', 'https://')(blurEvent(''))

      expect(applied).toEqual([{ buttonText: '' }, { buttonUrl: 'https://' }])
    })

    it('does not write when the input still holds a value', () => {
      const { applied, write } = createWriteCapture()

      headerFieldWriter(write).blurFallback('buttonUrl', 'https://')(blurEvent('https://example.com'))

      expect(applied).toEqual([])
    })
  })
})
