import { describe, expect, it } from 'vitest'

import { renderToHtml } from '#/_helpers/render'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/components/select'

// Base UI's `<Select.Value>` renders the RAW value by default, so call sites
// must resolve a label via `items` on `<Select>` or a `<SelectValue>` child
// function — these tests pin the mechanism (see the static contract test in
// tests/unit/contract/select-value-label.test.ts).

describe('Select value label resolution', () => {
  it('renders the selected item label when `items` is provided', () => {
    const html = renderToHtml(
      <Select items={[{ value: 'a', label: 'Alpha' }]} value="a">
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="a">Alpha</SelectItem>
        </SelectContent>
      </Select>,
    )
    expect(html).toContain('data-slot="select-value">Alpha</span>')
    expect(html).not.toContain('data-slot="select-value">a</span>')
  })

  it('renders the label resolved by the SelectValue children function', () => {
    const html = renderToHtml(
      <Select value="a">
        <SelectTrigger>
          <SelectValue>{(value) => (value === 'a' ? 'Alpha' : (value ?? ''))}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="a">Alpha</SelectItem>
        </SelectContent>
      </Select>,
    )
    expect(html).toContain('data-slot="select-value">Alpha</span>')
  })

  it('falls back to the raw value without items or children (documented Base UI default)', () => {
    const html = renderToHtml(
      <Select value="a">
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="a">Alpha</SelectItem>
        </SelectContent>
      </Select>,
    )
    expect(html).toContain('data-slot="select-value">a</span>')
  })

  it('renders the placeholder for an empty value', () => {
    const html = renderToHtml(
      <Select value="">
        <SelectTrigger>
          <SelectValue placeholder="— 无分类 —" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="">— 无分类 —</SelectItem>
        </SelectContent>
      </Select>,
    )
    expect(html).toContain('data-slot="select-value">— 无分类 —</span>')
  })
})
