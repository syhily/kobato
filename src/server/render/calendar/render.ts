import type { Buffer } from 'node:buffer'

import { createCanvas } from '@napi-rs/canvas'
import { getDate, getISODay, getMonth, getYear } from 'date-fns'
import { Solar } from 'lunar-typescript'

import type { AppLocale } from '@/shared/i18n/locales'

import { compressImage } from '@/server/infra/image/compress'
import { getDailyQuote } from '@/server/render/calendar/daily-quote'
import { auspiciousLabel, calendarCopyFor, lunarLabel } from '@/server/render/calendar/locale'
import { ensureCanvasFont, type FontSlot } from '@/server/render/canvas-fonts'
import { layoutCanvasLines } from '@/server/render/pretext-layout'

// Statically imported; the SEA bundler redirects the platform addon load to nativeRequire.

const WIDTH = 600
const HEIGHT = 880

// Font registration lives in canvas-fonts.ts, shared with the OG renderer.
function ensureFonts(): Promise<FontSlot | null> {
  return ensureCanvasFont('calendar')
}

function monthLabel(locale: AppLocale, date: Date): string {
  // `date-fns` `getMonth` is 0-indexed, so the array index is `getMonth(date)` directly.
  return calendarCopyFor(locale).months[getMonth(date)] ?? ''
}

function weekdayLabel(locale: AppLocale, date: Date): string {
  // ISO day-of-week: 1 = Monday … 7 = Sunday, hence the `- 1` offset.
  return calendarCopyFor(locale).weekdays[getISODay(date) - 1] ?? ''
}

/** Lunar line, or `null` for a locale that does not render it (en-US). */
function lunarTextFor(locale: AppLocale, date: Date): string | null {
  const copy = calendarCopyFor(locale)
  if (copy.lunar === null) {
    return null
  }
  const lunar = Solar.fromYmd(getYear(date), getMonth(date) + 1, getDate(date)).getLunar()
  return lunarLabel(copy, {
    yearGanZhi: lunar.getYearInGanZhi(),
    month: lunar.getMonth(),
    day: lunar.getDay(),
  })
}

/**
 * The 宜 line, or `null` for a locale that does not render it (en-US) or a
 * traditional term missing from the hand-reviewed table (never transliterated).
 */
function auspiciousTextFor(locale: AppLocale, date: Date): string | null {
  const copy = calendarCopyFor(locale)
  if (copy.auspicious === null) {
    return null
  }
  const lunar = Solar.fromYmd(getYear(date), getMonth(date) + 1, getDate(date)).getLunar()
  const auspicious = lunar.getDayYi()
  // Defensive guard (audit P2-25): an empty list must never render "宜undefined".
  if (auspicious.length === 0) {
    return null
  }
  return auspiciousLabel(copy, auspicious[Math.floor(getDate(date) % auspicious.length)] ?? '')
}

export type CalendarTheme = 'light' | 'dark'

export async function renderCalendar(date: Date, theme: CalendarTheme, locale: AppLocale): Promise<Buffer> {
  const calendarFontSlot = await ensureFonts()

  const quote = await getDailyQuote(date)
  const monthText = monthLabel(locale, date)
  const lunarText = lunarTextFor(locale, date)
  const weekday = weekdayLabel(locale, date)
  const dailyAuspicious = auspiciousTextFor(locale, date)

  const canvas = createCanvas(WIDTH, HEIGHT)
  const ctx = canvas.getContext('2d')

  // Light: opaque white card; dark: transparent canvas, white ink.
  const inkColor = theme === 'dark' ? '#ffffff' : '#000000'
  if (theme === 'light') {
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, WIDTH, HEIGHT)
  }

  ctx.strokeStyle = inkColor
  ctx.lineWidth = 4
  ctx.strokeRect(12, 12, WIDTH - 24, HEIGHT - 24)

  const calFont = calendarFontSlot?.family ?? 'serif'

  ctx.fillStyle = inkColor
  ctx.textBaseline = 'middle'
  ctx.font = `28px ${calFont}`
  ctx.textAlign = 'left'

  ctx.fillText(monthText, 36, 50)

  if (lunarText !== null) {
    ctx.textAlign = 'center'
    ctx.fillText(lunarText, WIDTH / 2, 50)
  }

  ctx.textAlign = 'right'
  ctx.fillText(weekday, WIDTH - 36, 50)

  ctx.beginPath()
  ctx.moveTo(36, 80)
  ctx.lineTo(WIDTH - 36, 80)
  ctx.lineWidth = 1.5
  ctx.stroke()

  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = `400px ${calFont}`
  const dayY = 320
  ctx.fillText(String(getDate(date)), WIDTH / 2, dayY)

  // The 宜 line is optional (en-US never renders it; a traditional locale may
  // omit an unmapped term). Without it the quote block moves up instead of
  // leaving the 220px gap empty.
  if (dailyAuspicious !== null) {
    ctx.font = `50px ${calFont}`
    ctx.fillText(dailyAuspicious, WIDTH / 2, dayY + 220)
  }

  const quoteStartY = dailyAuspicious !== null ? dayY + 280 : dayY + 120
  ctx.beginPath()
  ctx.moveTo(36, quoteStartY)
  ctx.lineTo(WIDTH - 36, quoteStartY)
  ctx.lineWidth = 1.5
  ctx.stroke()

  const quoteY = quoteStartY + 40
  const maxTextWidth = WIDTH - 72

  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  const quoteFont = `36px ${calFont}`
  ctx.font = quoteFont
  // Long entries overflow the card — clamp to three lines, ellipsize the last.
  const quoteLines = layoutCanvasLines(ctx, quote.content, quoteFont, maxTextWidth, 3)
  let y = quoteY
  const lineHeight = 56

  for (const line of quoteLines) {
    ctx.fillText(line, 36, y)
    y += lineHeight
  }

  y += 30
  ctx.font = `24px ${calFont}`
  ctx.textAlign = 'right'
  const authorText = quote.author || ''
  ctx.fillText(authorText, WIDTH - 36, HEIGHT - 50)

  const encodedImage = await canvas.encode('png')
  return compressImage(encodedImage, { preserveAlpha: theme === 'dark' })
}
