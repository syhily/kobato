import { describe, expect, it } from 'vitest'

import { parseUaFields } from '@/server/domains/analytics/ua-parse'

const DESKTOP_CHROME =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
const DESKTOP_MAC_SAFARI =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15'
const IPHONE_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1'
const REDUCED_ANDROID =
  'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36'
const GALAXY_S20 =
  'Mozilla/5.0 (Linux; Android 11; SM-G981B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/89.0.4389.105 Mobile Safari/537.36'
const GOOGLEBOT = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'
const FRESHRSS = 'FreshRSS/1.28.0 (Linux; https://freshrss.org)'
const EDGE =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36 Edg/121.0.0.0'

describe('analytics/ua-parse — parseUaFields', () => {
  it('returns all-null fields for an empty UA', () => {
    expect(parseUaFields('')).toEqual({ os: null, browser: null, browserType: null, device: null, deviceType: null })
  })

  it('infers deviceType desktop for desktop UAs — the field the old parser left empty', () => {
    const fields = parseUaFields(DESKTOP_CHROME)
    expect(fields.os).toBe('Windows')
    expect(fields.browser).toBe('Chrome')
    expect(fields.deviceType).toBe('desktop')
    // A desktop UA carries no hardware identifier — the model must stay
    // empty (ua-parser-js used to fabricate "Macintosh" here).
    expect(fields.device).toBeNull()
    expect(fields.browserType).toBeNull()
  })

  it('normalizes macOS naming to the historical spelling', () => {
    const fields = parseUaFields(DESKTOP_MAC_SAFARI)
    expect(fields.os).toBe('macOS')
    expect(fields.deviceType).toBe('desktop')
    expect(fields.device).toBeNull()
  })

  it('detects iPhone as mobile with the Apple model', () => {
    const fields = parseUaFields(IPHONE_SAFARI)
    expect(fields.os).toBe('iOS')
    expect(fields.deviceType).toBe('mobile')
    expect(fields.device).toBe('iPhone')
  })

  it('maps raw model numbers to brand-prefixed marketing names', () => {
    const fields = parseUaFields(GALAXY_S20)
    expect(fields.device).toBe('Samsung Galaxy S20 5G')
    expect(fields.deviceType).toBe('mobile')
  })

  it('leaves the device empty for Chrome UA-reduced Android without client hints', () => {
    const fields = parseUaFields(REDUCED_ANDROID)
    expect(fields.os).toBe('Android')
    expect(fields.deviceType).toBe('mobile')
    expect(fields.device).toBeNull()
  })

  it('recovers device model from client hints on a reduced Android UA', () => {
    const fields = parseUaFields(REDUCED_ANDROID, {
      model: 'Pixel 7',
      platform: '"Android"',
      platformVersion: '"15.0.0"',
      mobile: '?1',
      brands: '"Google Chrome";v="139", "Chromium";v="139", "Not/A)Brand";v="24"',
    })
    expect(fields.device).toBe('Google Pixel 7')
    expect(fields.deviceType).toBe('mobile')
    expect(fields.os).toBe('Android')
  })

  it('classifies crawlers via browserType for the bot gate', () => {
    expect(parseUaFields(GOOGLEBOT).browserType).toBe('crawler')
  })

  it('classifies feed readers as fetcher — FreshRSS stops counting as a visitor', () => {
    const fields = parseUaFields(FRESHRSS)
    expect(fields.browserType).toBe('fetcher')
  })

  it('normalizes Edge naming to the historical spelling', () => {
    expect(parseUaFields(EDGE).browser).toBe('Edge')
  })

  it('returns identical results for repeated parses (LRU-cached)', () => {
    const first = parseUaFields(DESKTOP_CHROME)
    const second = parseUaFields(DESKTOP_CHROME)
    expect(second).toBe(first)
  })
})
