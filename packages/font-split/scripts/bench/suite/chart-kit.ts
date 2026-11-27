export const PALETTE = {
  muted: '#8b949e',
  red: '#cf222e',
  purple: '#8250df',
  blue: '#316dca',
  green: '#1a7f37',
  amber: '#9a6700',
} as const

export const r1 = (value: number): number => Math.round(value * 10) / 10

export function esc(text: string): string {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
}

const FONT = 'font-family="ui-sans-serif,system-ui,-apple-system,Segoe UI,Helvetica,Arial,sans-serif" font-size="12"'

export function svgDocument(width: number, height: number, body: readonly string[]): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" ${FONT}>\n${body.join('\n')}\n</svg>\n`
}

export interface Series {
  name: string
  color: string
  points: readonly (readonly [number, number])[]
  dash?: string
  dots?: boolean
}

export interface Tick {
  v: number
  label?: string
}

export interface Reference {
  y: number
  color: string
  dash?: string
}

export interface PanelOptions {
  ty?: number
  title: string
  xMin: number
  xMax: number
  xTicks: readonly Tick[]
  yMin: number
  yMax: number
  yStep: number
  yFormat: (value: number) => string
  series: readonly Series[]
  references?: readonly Reference[]
  xRef?: number
  xRefLabel?: string
  caption?: string
  left?: number
  top?: number
  width?: number
  height?: number
}

export function linePanel(options: PanelOptions): string[] {
  const { left = 58, top = 54, width = 798, height = 202, ty = 0 } = options
  const right = left + width
  const bottom = top + height
  const sx = (value: number): number => left + ((value - options.xMin) / (options.xMax - options.xMin)) * width
  const sy = (value: number): number => bottom - ((value - options.yMin) / (options.yMax - options.yMin)) * height
  const out = [
    `<g transform="translate(0 ${ty})">`,
    `<text x="${left}" y="18" fill="${PALETTE.muted}">${esc(options.title)}</text>`,
  ]
  for (let value = options.yMin; value <= options.yMax * 1.0001; value += options.yStep) {
    const y = r1(sy(value))
    out.push(`<line x1="${left}" x2="${right}" y1="${y}" y2="${y}" stroke="${PALETTE.muted}" stroke-opacity="0.25"/>`)
    out.push(
      `<text x="${left - 8}" y="${r1(y + 4)}" text-anchor="end" fill="${PALETTE.muted}">${esc(options.yFormat(value))}</text>`,
    )
  }
  for (const tick of options.xTicks) {
    const x = r1(sx(tick.v))
    out.push(`<line x1="${x}" x2="${x}" y1="${bottom}" y2="${bottom + 4}" stroke="${PALETTE.muted}"/>`)
    out.push(
      `<text x="${x}" y="${bottom + 16}" text-anchor="middle" fill="${PALETTE.muted}">${esc(tick.label ?? String(tick.v))}</text>`,
    )
  }
  out.push(`<line x1="${left}" x2="${right}" y1="${bottom}" y2="${bottom}" stroke="${PALETTE.muted}"/>`)
  out.push(`<line x1="${left}" x2="${left}" y1="${top}" y2="${bottom}" stroke="${PALETTE.muted}"/>`)
  for (const reference of options.references ?? []) {
    const y = r1(sy(reference.y))
    out.push(
      `<line x1="${left}" x2="${right}" y1="${y}" y2="${y}" stroke="${reference.color}" stroke-dasharray="${reference.dash ?? '5 4'}" stroke-width="1.5"/>`,
    )
  }
  if (options.xRef !== undefined) {
    const x = r1(sx(options.xRef))
    out.push(`<line x1="${x}" x2="${x}" y1="${top}" y2="${bottom}" stroke="${PALETTE.muted}" stroke-dasharray="2 4"/>`)
    if (options.xRefLabel !== undefined) {
      out.push(`<text x="${r1(x + 5)}" y="${bottom - 6}" fill="${PALETTE.muted}">${esc(options.xRefLabel)}</text>`)
    }
  }
  for (const series of options.series) {
    const path = series.points.map(([x, y], index) => `${index ? 'L' : 'M'}${r1(sx(x))} ${r1(sy(y))}`).join(' ')
    out.push(
      `<path d="${path}" fill="none" stroke="${series.color}" stroke-width="2"${series.dash ? ` stroke-dasharray="${series.dash}"` : ''} stroke-linejoin="round"/>`,
    )
    if (series.dots) {
      for (const [x, y] of series.points) {
        out.push(`<circle cx="${r1(sx(x))}" cy="${r1(sy(y))}" r="3.5" fill="${series.color}"/>`)
      }
    }
  }
  let x = left + 4
  for (const series of options.series) {
    out.push(
      `<line x1="${r1(x)}" x2="${r1(x + 18)}" y1="46" y2="46" stroke="${series.color}" stroke-width="2.5"${series.dash ? ` stroke-dasharray="6 4"` : ''}/>`,
    )
    out.push(`<text x="${r1(x + 23)}" y="50" fill="${PALETTE.muted}">${esc(series.name)}</text>`)
    x += 23 + 23 + series.name.length * 6.3 + 24
  }
  if (options.caption !== undefined) {
    out.push(
      `<text x="${r1((left + right) / 2)}" y="${bottom + 38}" text-anchor="middle" fill="${PALETTE.muted}">${esc(options.caption)}</text>`,
    )
  }
  out.push('</g>')
  return out
}

export interface Bounds {
  min: number
  max: number
  step: number
}

export function niceStep(raw: number): number {
  if (raw <= 0) {
    return 1
  }
  const pow = 10 ** Math.floor(Math.log10(raw))
  const fraction = raw / pow
  return (fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 2.5 ? 2.5 : fraction <= 5 ? 5 : 10) * pow
}

export function niceBounds(values: readonly number[], ticks = 6): Bounds {
  const low = Math.min(...values)
  const high = Math.max(...values)
  if (low === high) {
    return { min: Math.max(0, low - 1), max: high + 1, step: 1 }
  }
  const step = niceStep((high - low) / ticks)
  return { min: Math.floor(low / step) * step, max: Math.ceil(high / step) * step, step }
}

export function zeroBounds(values: readonly number[], ticks = 6): Bounds {
  const high = Math.max(0, ...values)
  const step = niceStep(high / ticks)
  return { min: 0, max: Math.ceil(high / step) * step, step }
}

export function barPanel(options: {
  x: number
  y: number
  title: string
  bars: readonly { label: string; value: number }[]
  colors: readonly string[]
}): string[] {
  const { x, y, title, colors, bars } = options
  const baseline = y + 160
  const max = Math.max(...bars.map((bar) => bar.value))
  const start = x + (266 - (bars.length * 100 - 30)) / 2
  const out = [`<text x="${x}" y="${y + 20}" fill="${PALETTE.muted}">${esc(title)}</text>`]
  bars.forEach((bar, index) => {
    const height = (bar.value / max) * 120
    const at = r1(start + index * 100)
    out.push(
      `<rect x="${at}" y="${r1(baseline - height)}" width="70" height="${r1(height)}" rx="3" fill="${colors[index]!}"/>`,
    )
    out.push(
      `<text x="${r1(at + 35)}" y="${r1(baseline - height - 5)}" text-anchor="middle" fill="${PALETTE.muted}">${esc(bar.label)}</text>`,
    )
  })
  out.push(`<line x1="${x}" x2="${x + 266}" y1="${baseline}" y2="${baseline}" stroke="${PALETTE.muted}"/>`)
  return out
}
