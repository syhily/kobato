import { renderToHtml, stableHtml } from '@kobato/test/render.tsx'
import { DateTimePicker } from '@kobato/web-admin/ui/editor-meta/DateTimePicker.tsx'
import { describe, expect, it } from 'vitest'

// DateTimePicker is props-driven; its calendar popover mounts only on click
// (client-only), so assert the trigger label.

const noop = () => undefined

describe('snapshot: DateTimePicker', () => {
  it('renders the empty-state trigger label when value is blank', () => {
    const html = stableHtml(renderToHtml(<DateTimePicker value="" onChange={noop} />))
    expect(html).toContain('选择日期与时间')
    expect(html).toContain('data-empty="true"')
  })

  it('renders a localized date + time label when a value is set', () => {
    // A future date so the local-input parse is deterministic regardless of TZ.
    const html = stableHtml(renderToHtml(<DateTimePicker value="2099-06-15T14:30" onChange={noop} />))
    expect(html).toContain('2099/6/15 14:30')
    expect(html).toContain('data-empty="false"')
  })

  it('renders a morning time without shifting the wall clock', () => {
    const html = stableHtml(renderToHtml(<DateTimePicker value="2099-06-15T09:05" onChange={noop} />))
    expect(html).toContain('2099/6/15 09:05')
  })

  it('renders a disabled trigger when the disabled prop is set', () => {
    const html = stableHtml(renderToHtml(<DateTimePicker value="" onChange={noop} disabled={true} />))
    expect(html).toContain('disabled=""')
    expect(html).toContain('选择日期与时间')
  })

  it('honours a custom id prop on the trigger button', () => {
    const html = stableHtml(renderToHtml(<DateTimePicker value="" onChange={noop} id="custom-dtp" />))
    expect(html).toContain('id="custom-dtp"')
  })

  it('renders the popover trigger even when the value is unparseable garbage', () => {
    const html = stableHtml(renderToHtml(<DateTimePicker value="not-a-date" onChange={noop} />))
    expect(html).toContain('选择日期与时间')
    expect(html).toContain('data-empty="true"')
  })
})
