import { Solar } from 'lunar-typescript'
import { describe, expect, it } from 'vitest'

import { TRADITIONAL_YI_TERM_MAP, auspiciousLabel, calendarCopyFor, lunarLabel } from '@/server/render/calendar/locale'
import { SUPPORTED_LOCALES } from '@/shared/i18n/locales'

// Calendar copy is static per-locale data: en-US renders no lunar / 宜 lines, zh-TW + zh-HK
// use a hand-reviewed traditional table, and nothing is converted at runtime.

describe('calendar locale copy', () => {
  it('labels months and weekdays per locale', () => {
    expect(calendarCopyFor('zh-CN').months[0]).toBe('一月')
    expect(calendarCopyFor('zh-CN').months[11]).toBe('十二月')
    expect(calendarCopyFor('zh-TW').months[0]).toBe('一月')
    expect(calendarCopyFor('en-US').months[0]).toBe('January')
    expect(calendarCopyFor('en-US').months[11]).toBe('December')

    expect(calendarCopyFor('zh-CN').weekdays[0]).toBe('星期一')
    expect(calendarCopyFor('zh-HK').weekdays[6]).toBe('星期日')
    expect(calendarCopyFor('en-US').weekdays).toEqual([
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
      'Saturday',
      'Sunday',
    ])
  })

  it('renders no lunar or 宜 line for en-US', () => {
    const copy = calendarCopyFor('en-US')
    expect(copy.lunar).toBeNull()
    expect(copy.auspicious).toBeNull()
    expect(lunarLabel(copy, { yearGanZhi: '甲辰', month: 1, day: 1 })).toBeNull()
    expect(auspiciousLabel(copy, '祭祀')).toBeNull()
  })

  it('labels the lunar date with the locale month terms (incl. leap months)', () => {
    expect(lunarLabel(calendarCopyFor('zh-CN'), { yearGanZhi: '甲辰', month: 1, day: 1 })).toBe('甲辰年 正月初一')
    expect(lunarLabel(calendarCopyFor('zh-CN'), { yearGanZhi: '癸卯', month: 12, day: 30 })).toBe('癸卯年 腊月三十')
    expect(lunarLabel(calendarCopyFor('zh-TW'), { yearGanZhi: '癸卯', month: 12, day: 30 })).toBe('癸卯年 臘月三十')
    expect(lunarLabel(calendarCopyFor('zh-HK'), { yearGanZhi: '乙巳', month: -6, day: 8 })).toBe('乙巳年 閏六月初八')
    expect(lunarLabel(calendarCopyFor('zh-CN'), { yearGanZhi: '乙巳', month: -6, day: 8 })).toBe('乙巳年 闰六月初八')
  })

  it('keeps zh-CN 宜 terms verbatim and maps traditional locales through the static table', () => {
    expect(auspiciousLabel(calendarCopyFor('zh-CN'), '动土')).toBe('宜动土')
    expect(auspiciousLabel(calendarCopyFor('zh-CN'), '会亲友')).toBe('宜会亲友')
    expect(auspiciousLabel(calendarCopyFor('zh-TW'), '动土')).toBe('宜動土')
    expect(auspiciousLabel(calendarCopyFor('zh-TW'), '会亲友')).toBe('宜會親友')
    expect(auspiciousLabel(calendarCopyFor('zh-HK'), '诸事不宜')).toBe('宜諸事不宜')
    // Identical glyphs still resolve through the table (no implicit identity fallback).
    expect(auspiciousLabel(calendarCopyFor('zh-TW'), '祭祀')).toBe('宜祭祀')
  })

  it('omits an unmapped traditional term instead of transliterating it', () => {
    expect(auspiciousLabel(calendarCopyFor('zh-TW'), '不存在的术语')).toBeNull()
    expect(auspiciousLabel(calendarCopyFor('zh-CN'), '')).toBeNull()
  })

  it('maps EVERY 宜 term lunar-typescript can emit for the traditional locales', () => {
    const emitted = new Set<string>()
    // Two full solar cycles cover the library's fixed term table (leap months included).
    for (let year = 2020; year < 2028; year++) {
      for (let month = 1; month <= 12; month++) {
        for (let day = 1; day <= 28; day++) {
          for (const term of Solar.fromYmd(year, month, day).getLunar().getDayYi()) {
            emitted.add(term)
          }
        }
      }
    }

    expect(emitted.size).toBeGreaterThan(90)
    const missing = [...emitted].filter((term) => TRADITIONAL_YI_TERM_MAP[term] === undefined)
    expect(missing).toEqual([])
    for (const [simplified, traditional] of Object.entries(TRADITIONAL_YI_TERM_MAP)) {
      expect(traditional, simplified).not.toBe('')
    }
  })

  it('defines a copy object for every supported locale', () => {
    for (const locale of SUPPORTED_LOCALES) {
      const copy = calendarCopyFor(locale)
      expect(copy.months).toHaveLength(12)
      expect(copy.weekdays).toHaveLength(7)
    }
  })
})
