import type { SKRSContext2D } from '@napi-rs/canvas'
import type { Buffer } from 'node:buffer'

import { getDate, getISODay, getMonth, getYear } from 'date-fns'
import { Solar } from 'lunar-typescript'

import { compressImage } from '@/server/infra/image/compress'
import { requireExternal } from '@/server/infra/sea'
import { getDailyQuote } from '@/server/render/calendar/daily-quote'
import { ensureCanvasFont, type FontSlot } from '@/server/render/canvas-fonts'

// Native module — must resolve against the extracted tree under SEA (see
// `@/server/infra/sea`). Outside SEA this resolves node_modules normally.
const { createCanvas } = requireExternal<typeof import('@napi-rs/canvas')>('@napi-rs/canvas')

const WIDTH = 600
const HEIGHT = 880

// Font registration lives in `render/canvas-fonts.ts` (`ensureCanvasFont`) —
// one single-flight per slot, shared with the OG renderer.
function ensureFonts(): Promise<FontSlot | null> {
  return ensureCanvasFont('calendar')
}

function getMonthLabel(date: Date) {
  const months = ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月']
  // `date-fns` `getMonth` is 0-indexed, so the array index is `getMonth(date)` directly.
  return months[getMonth(date)]
}

function getWeekdayLabel(date: Date) {
  const weekdays = ['星期一', '星期二', '星期三', '星期四', '星期五', '星期六', '星期日']
  // ISO day-of-week: 1 = Monday … 7 = Sunday, hence the `- 1` offset.
  return weekdays[getISODay(date) - 1]
}

function getLunarLabel(date: Date) {
  const solar = Solar.fromYmd(getYear(date), getMonth(date) + 1, getDate(date))
  const lunar = solar.getLunar()
  return `${lunar.getYearInGanZhi()}年 ${lunar.getMonthInChinese()}月${lunar.getDayInChinese()}`
}

function getDailyAuspiciousLabel(date: Date) {
  const solar = Solar.fromYmd(getYear(date), getMonth(date) + 1, getDate(date))
  const lunar = solar.getLunar()
  const auspicious = lunar.getDayYi()
  return `宜${auspicious[Math.floor(getDate(date) % auspicious.length)]}`
}

function wrapText(ctx: SKRSContext2D, text: string, maxWidth: number) {
  const words = text.split('')
  const lines: string[] = []
  let line = ''
  for (const ch of words) {
    const test = line + ch
    if (ctx.measureText(test).width > maxWidth && line !== '') {
      lines.push(line)
      line = ch
    } else {
      line = test
    }
  }
  if (line) {
    if (line.length > 1) {
      lines.push(line)
    } else {
      lines[lines.length - 1] += line
    }
  }

  return lines
}

export type CalendarTheme = 'light' | 'dark'

export async function renderCalendar(date: Date, theme: CalendarTheme = 'light'): Promise<Buffer> {
  const calendarFontSlot = await ensureFonts()

  const quote = await getDailyQuote(date)
  const monthText = getMonthLabel(date)
  const lunarText = getLunarLabel(date)
  const weekday = getWeekdayLabel(date)
  const dailyAuspicious = getDailyAuspiciousLabel(date)

  const canvas = createCanvas(WIDTH, HEIGHT)
  const ctx = canvas.getContext('2d')

  // Light keeps the original opaque white card; dark leaves the canvas
  // transparent so the sidebar's dark background shows through, and
  // strokes/text flip to white.
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

  ctx.textAlign = 'center'
  ctx.fillText(lunarText, WIDTH / 2, 50)

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

  ctx.font = `50px ${calFont}`
  const auspiciousY = dayY + 220
  ctx.fillText(dailyAuspicious, WIDTH / 2, auspiciousY)

  const quoteStartY = auspiciousY + 60
  ctx.beginPath()
  ctx.moveTo(36, quoteStartY)
  ctx.lineTo(WIDTH - 36, quoteStartY)
  ctx.lineWidth = 1.5
  ctx.stroke()

  const quoteY = quoteStartY + 40
  const maxTextWidth = WIDTH - 72

  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  ctx.font = `36px ${calFont}`
  const quoteText = quote.content
  const quoteLines = wrapText(ctx, quoteText, maxTextWidth)
  // The full built-in bank contains entries of 100+ chars, which would
  // overflow the card and collide with the author line — clamp to the
  // three lines that fit and ellipsize the last visible one.
  const MAX_QUOTE_LINES = 3
  if (quoteLines.length > MAX_QUOTE_LINES) {
    quoteLines.length = MAX_QUOTE_LINES
    let last = quoteLines[MAX_QUOTE_LINES - 1]
    while (last.length > 1 && ctx.measureText(`${last}…`).width > maxTextWidth) {
      last = last.slice(0, -1)
    }
    quoteLines[MAX_QUOTE_LINES - 1] = `${last}…`
  }
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
