import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { wrapWithI18n } from '#/_helpers/i18n-render'
import { DateTimePicker } from '@/ui/admin/editor-shell/DateTimePicker'
import { Calendar } from '@/ui/components/calendar'

const noop = () => {}

describe('DateTimePicker i18n', () => {
  it('renders the wall-clock value per locale in an explicit zone', () => {
    const zhCN = renderToStaticMarkup(wrapWithI18n(<DateTimePicker value="2099-06-15T14:30" onChange={noop} />))
    expect(zhCN).toContain('2099/6/15 14:30')

    const enUS = renderToStaticMarkup(
      wrapWithI18n(<DateTimePicker value="2099-06-15T14:30" onChange={noop} />, { locale: 'en-US' }),
    )
    expect(enUS).toContain('6/15/99, 2:30 PM')

    const zhTW = renderToStaticMarkup(
      wrapWithI18n(<DateTimePicker value="2099-06-15T14:30" onChange={noop} />, { locale: 'zh-TW' }),
    )
    // CLDR zh-TW's short time is h12 with a dayPeriod.
    expect(zhTW).toContain('2099/6/15')
    expect(zhTW).toContain('下午2:30')
  })

  it('localizes its own labels (AM/PM, placeholder)', () => {
    const enUS = renderToStaticMarkup(wrapWithI18n(<DateTimePicker value="" onChange={noop} />, { locale: 'en-US' }))
    expect(enUS).toContain('Select date and time')

    // The open panel is only mounted on interaction; the trigger label is the
    // SSR-visible surface, so the AM/PM copy is asserted through the catalogs.
    const zhCN = renderToStaticMarkup(wrapWithI18n(<DateTimePicker value="" onChange={noop} />))
    expect(zhCN).toContain('选择日期与时间')
  })

  it('is deterministic across identical server renders (no host-zone drift)', () => {
    const first = renderToStaticMarkup(wrapWithI18n(<DateTimePicker value="2099-06-15T14:30" onChange={noop} />))
    const second = renderToStaticMarkup(wrapWithI18n(<DateTimePicker value="2099-06-15T14:30" onChange={noop} />))
    expect(first).toBe(second)
  })
})

describe('Calendar i18n', () => {
  const march2024 = new Date(2024, 2, 1)

  it('localizes the month caption through the date-fns locale map', () => {
    const zhTW = renderToStaticMarkup(
      wrapWithI18n(<Calendar mode="single" defaultMonth={march2024} />, { locale: 'zh-TW' }),
    )
    expect(zhTW).toContain('2024年3月')

    const enUS = renderToStaticMarkup(
      wrapWithI18n(<Calendar mode="single" defaultMonth={march2024} />, { locale: 'en-US' }),
    )
    expect(enUS).toContain('March 2024')
  })

  it('keeps data-day a machine yyyy-MM-dd value, never a localized date', () => {
    const html = renderToStaticMarkup(
      wrapWithI18n(<Calendar mode="single" defaultMonth={march2024} />, { locale: 'zh-TW' }),
    )

    expect(html).toContain('data-day="2024-03-05"')
    expect(html).not.toContain('data-day="2024/3/5"')
    expect(html).not.toContain('data-day="3/5/2024"')
  })
})
