import { describe, expect, it } from 'vitest'

import { DEFAULT_LABELS, lookupLabel, resolveLabels } from '@/labels/inkling-labels'

describe('labels', () => {
  describe('resolveLabels', () => {
    it('falls back to the English default for missing keys', () => {
      const labels = resolveLabels({ 'placeholder.editor': '在此处开始编写内容…' })

      expect(labels['placeholder.editor']).toBe('在此处开始编写内容…')
      expect(labels['menu.image.label']).toBe(DEFAULT_LABELS['menu.image.label'])
    })

    it('applies a full override table', () => {
      const override = Object.fromEntries(
        Object.keys(DEFAULT_LABELS).map((key) => [key, `zh:${key}`]),
      ) as unknown as typeof DEFAULT_LABELS
      const labels = resolveLabels(override)

      for (const key of Object.keys(DEFAULT_LABELS) as Array<keyof typeof DEFAULT_LABELS>) {
        expect(labels[key]).toBe(`zh:${key}`)
      }
    })

    it('returns the defaults unchanged for empty or missing input', () => {
      expect(resolveLabels()).toEqual(DEFAULT_LABELS)
      expect(resolveLabels({})).toEqual(DEFAULT_LABELS)
    })

    it('does not mutate DEFAULT_LABELS', () => {
      resolveLabels({ 'toolbar.bold': '加粗' })
      expect(DEFAULT_LABELS['toolbar.bold']).toBe('Bold')
    })
  })

  describe('lookupLabel', () => {
    it('resolves a known key from the table', () => {
      expect(lookupLabel(DEFAULT_LABELS, 'menu.image.label', 'Image')).toBe('Image')
    })

    it('falls back for an unknown key (e.g. a host card labelKey)', () => {
      expect(lookupLabel(DEFAULT_LABELS, 'menu.music.label', 'Music')).toBe('Music')
    })
  })

  // The table is a public contract the moment it lands in the barrel — this
  // snapshot pins the key list so a rename or removal is a deliberate,
  // review-visible change, never a drive-by edit.
  it('pins the full key list', () => {
    expect(Object.keys(DEFAULT_LABELS).sort()).toMatchSnapshot()
  })
})
