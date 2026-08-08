import { MAX_TTL_HOURS, MIN_TTL_HOURS, SECONDS_PER_HOUR } from '@/ui/admin/settings/cache/cache-constants'

// Render the stored TTL in the most readable unit — sub-hour values keep their own units.
export function formatTtl(seconds: number): string {
  if (seconds < SECONDS_PER_HOUR) {
    if (seconds % 60 === 0) {
      return `${seconds / 60} 分钟`
    }
    return `${seconds} 秒`
  }
  const totalHours = Math.round(seconds / SECONDS_PER_HOUR)
  if (totalHours >= 24 && totalHours % 24 === 0) {
    const days = totalHours / 24
    return `${days} 天`
  }
  return `${totalHours} 小时`
}

// Format on the client only to avoid an SSR / hydration mismatch on locales / time zones.
export function formatTimestamp(iso: string): string {
  try {
    const date = new Date(iso)
    return date.toLocaleString()
  } catch {
    return iso
  }
}

export function hoursToSeconds(hours: number): number {
  return Math.max(MIN_TTL_HOURS, Math.min(MAX_TTL_HOURS, Math.trunc(hours))) * SECONDS_PER_HOUR
}

export function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) {
    return min
  }
  return Math.max(min, Math.min(max, value))
}
