export const int = (value: number): string => Math.round(value).toLocaleString('en-US')
export const one = (value: number): string => value.toFixed(1)
export const two = (value: number): string => value.toFixed(2)
export const three = (value: number): string => value.toFixed(3)
export const kb = (bytes: number): string => int(bytes / 1024)
export const mib = (bytes: number): string => (bytes / 1024 ** 2).toFixed(1)
export const mb = (bytes: number): string => (bytes / 1e6).toFixed(2)
export const kib = (bytes: number): string => `${int(bytes / 1024)} KB`
export const MINUS = '−'

export function pct(value: number, base: number): string {
  const change = (value / base) * 100 - 100
  return `${change < 0 ? MINUS : '+'}${Math.abs(change).toFixed(0)}%`
}

export function pct1(value: number, base: number): string {
  const share = base === 0 ? 0 : (value / base) * 100
  return Number.isInteger(share) ? `${share}%` : `${share.toFixed(1)}%`
}

export function signed(value: number, digits: number): string {
  const text = Math.abs(value).toFixed(digits)
  return value < 0 ? `${MINUS}${text}` : `+${text}`
}

export function ratioPct(value: number, base: number, digits = 1): string {
  return signed((value / base) * 100 - 100, digits)
}

export function day(stamp: string): string {
  const date = new Date(stamp)
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export const num = (value: number, digits: number): string =>
  `${value < 0 ? MINUS : ''}${Math.abs(value).toFixed(digits)}`

export function percent(value: number): string {
  const rounded = Math.round(value)
  return rounded === 0 ? '0%' : `${rounded < 0 ? MINUS : ''}${Math.abs(rounded)}%`
}
