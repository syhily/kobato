import { describe, expect, it } from 'vitest'

import { formatUaLabel } from '@/server/domains/analytics/ua-parse'

// Server-rendered session labels (the admin session lists): node-device-detector
// with the analytics normalization maps; never parsed in the browser.

describe('ua-parse — formatUaLabel', () => {
  it('returns the English technical label for empty input (no hardcoded Han copy)', () => {
    expect(formatUaLabel(null)).toBe('Unknown device')
    expect(formatUaLabel(undefined)).toBe('Unknown device')
    expect(formatUaLabel('')).toBe('Unknown device')
  })

  it("accepts the request locale's unknown-device label at the call site", () => {
    expect(formatUaLabel(null, null, '未知设备')).toBe('未知设备')
    expect(formatUaLabel('', '', '未知裝置')).toBe('未知裝置')
    // A platform hint still wins over the placeholder.
    expect(formatUaLabel(null, 'iOS', '未知设备')).toBe('iOS')
  })

  it('falls back to the platform hint when the UA is missing', () => {
    expect(formatUaLabel(null, 'iOS')).toBe('iOS')
    expect(formatUaLabel('', 'Windows')).toBe('Windows')
  })

  it('strips the structured-header quotes from the platform hint', () => {
    expect(formatUaLabel(null, '"macOS"')).toBe('macOS')
    expect(formatUaLabel(null, '""')).toBe('Unknown device')
  })

  it('combines browser and normalized os when both parse', () => {
    const ua =
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    expect(formatUaLabel(ua)).toBe('Chrome 120 · macOS')
  })

  it('trims the browser version to the major segment', () => {
    const ua =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.5.0.193 Safari/537.36'
    expect(formatUaLabel(ua)).toBe('Chrome 121 · Windows')
  })

  it('normalizes the diverted client names (Mobile Chrome/Microsoft Edge/GNU/Linux)', () => {
    const edge =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36 Edg/120.0.0.0'
    expect(formatUaLabel(edge)).toBe('Edge 120 · Windows')

    const linux = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36'
    expect(formatUaLabel(linux)).toBe('Chrome 120 · Linux')
  })

  it('keeps the browser-only label when no OS parses', () => {
    expect(formatUaLabel('curl/8.0')).toBe('curl 8')
  })

  it('keeps the OS when it is the only parsed half', () => {
    const ua = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)'
    expect(formatUaLabel(ua)).toContain('iOS')
  })

  it('prefers the UA-CH platform hint over the parsed OS (desktop-mode iOS)', () => {
    const ua =
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15'
    const label = formatUaLabel(ua, 'iOS')
    expect(label).toBe('Safari 17 · iOS')
    expect(label).not.toContain('macOS')
  })

  it('truncates an unparseable UA to the cap and appends ellipsis', () => {
    const label = formatUaLabel('x'.repeat(120))
    expect(label.length).toBe(80)
    expect(label.endsWith('…')).toBe(true)
  })

  it('returns a short unparseable UA verbatim', () => {
    expect(formatUaLabel('x-custom-agent')).toBe('x-custom-agent')
  })
})
