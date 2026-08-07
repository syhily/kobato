import { describe, expect, it } from 'vitest'

import { renderToHtml } from '#/_helpers/render'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/components/select'

// The `@/ui/components/select` wrapper is a thin pass-through over Base UI's
// Select. Base UI's `<Select.Value>` renders the RAW `value` by default (see
// the docs: "By default, the `<Select.Value>` component renders the raw
// `value`"), so every call site must resolve a display label through one of
// the two sanctioned mechanisms:
//
//   1. `items` on the root `<Select>` — Base UI then renders the selected
//      item's label automatically (used by PostsView / ImagesFilterBar /
//      UsersToolbar / AddMusicDialog / UserOperationsCard / BackupScheduleForm).
//   2. a children function on `<SelectValue>` — the call site maps the raw
//      value to its own label (AlignSelect / BlockStyle / CategoryField /
//      settings forms).
//
// These tests pin the mechanism itself; a static contract test
// (`tests/unit/contract/select-value-label.test.ts`) enforces that every
// call site uses one of the two.

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
