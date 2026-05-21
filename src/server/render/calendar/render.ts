import type { SKRSContext2D } from '@napi-rs/canvas'
import type { Buffer } from 'node:buffer'

import { createCanvas, GlobalFonts } from '@napi-rs/canvas'
import { format, getDate, getISODay, getMonth, getYear } from 'date-fns'
import { Solar } from 'lunar-typescript'

import { compressImage } from '@/server/render/image-compress'
import { oppoSerif } from '@/server/render/og/assets'

const WIDTH = 600
const HEIGHT = 880

// Single-flight font registration mirroring `og.ts`. See that file for
// the full rationale; in short, both the cached-empty-URL path AND the
// catch path must clear `calendarFontReady` so the next render
// re-reads settings — otherwise pasting a URL after first render takes
// effect only on process restart.
let calendarFontReady: Promise<void> | null = null
function ensureFonts(): Promise<void> {
  if (GlobalFonts.has('OPPOSerif')) {
    return Promise.resolve()
  }
  if (calendarFontReady === null) {
    calendarFontReady = (async () => {
      const buffer = await oppoSerif()
      if (buffer !== null && !GlobalFonts.has('OPPOSerif')) {
        GlobalFonts.register(buffer, 'OPPOSerif')
      }
    })()
      .catch((err) => {
        calendarFontReady = null
        throw err
      })
      .finally(() => {
        if (!GlobalFonts.has('OPPOSerif')) {
          calendarFontReady = null
        }
      })
  }
  return calendarFontReady
}

async function fetchDailyQuote(date: Date) {
  const url = `https://apiv3.shanbay.com/weapps/dailyquote/quote?date=${format(date, 'yyyy-MM-dd')}`
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`API 请求失败: ${res.status}`)
  }
  return res.json() as Promise<{ content: string; translation: string; author: string }>
}

function getMonthLabel(date: Date) {
  const months = ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月']
  // `date-fns` `getMonth` is 0-indexed (matches `Date.prototype.getMonth`),
  // so the array index is `getMonth(date)` directly — no `- 1` offset
  // like the previous `luxon.month` (1-indexed) needed.
  return months[getMonth(date)]
}

function getWeekdayLabel(date: Date) {
  const weekdays = ['星期一', '星期二', '星期三', '星期四', '星期五', '星期六', '星期日']
  // ISO day-of-week: 1 = Monday … 7 = Sunday. Same convention as the
  // previous `luxon.weekday`, so the `- 1` offset stays the same.
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
  await ensureFonts()

  // Generate the required data from date.
  const quoteData = await fetchDailyQuote(date)
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

  ctx.fillStyle = inkColor
  ctx.textBaseline = 'middle'
  ctx.font = '28px OPPOSerif'
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
  ctx.font = '400px OPPOSerif'
  const dayY = 320
  ctx.fillText(String(getDate(date)), WIDTH / 2, dayY)

  ctx.font = '50px OPPOSerif'
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
  ctx.font = '36px OPPOSerif'
  const quoteText = quoteData.translation
  const quoteLines = wrapText(ctx, quoteText, maxTextWidth)
  let y = quoteY
  const lineHeight = 56

  for (const line of quoteLines) {
    ctx.fillText(line, 36, y)
    y += lineHeight
  }

  y += 30
  ctx.font = '24px OPPOSerif'
  ctx.textAlign = 'right'
  const authorText = quoteData.author || ''
  ctx.fillText(authorText, WIDTH - 36, HEIGHT - 50)

  const encodedImage = await canvas.encode('png')
  return compressImage(encodedImage, { preserveAlpha: theme === 'dark' })
}
