import { describe, expect, it } from 'vitest'

import { isNewerVersion } from '@/server/domains/update/version'

describe('update/version isNewerVersion', () => {
  it('detects newer patch, minor, and major versions', () => {
    expect(isNewerVersion('v1.2.4', '1.2.3')).toBe(true)
    expect(isNewerVersion('v1.3.0', '1.2.9')).toBe(true)
    expect(isNewerVersion('v2.0.0', '1.9.9')).toBe(true)
  })

  it('detects same or older versions', () => {
    expect(isNewerVersion('v1.2.3', '1.2.3')).toBe(false)
    expect(isNewerVersion('1.2.3', '1.2.3')).toBe(false)
    expect(isNewerVersion('v1.2.2', '1.2.3')).toBe(false)
    expect(isNewerVersion('v1.1.9', '1.2.0')).toBe(false)
    expect(isNewerVersion('v0.9.9', '1.0.0')).toBe(false)
  })

  it('treats a leading v on either side as equal', () => {
    expect(isNewerVersion('v1.2.3', 'v1.2.3')).toBe(false)
    expect(isNewerVersion('1.2.4', 'v1.2.3')).toBe(true)
  })

  it('ignores pre-release suffixes beyond the dev gate', () => {
    expect(isNewerVersion('v1.2.3', '1.2.3-dev')).toBe(false)
    expect(isNewerVersion('v1.2.4-beta', '1.2.3')).toBe(true)
    expect(isNewerVersion('v1.2.3', '1.2.4-dev')).toBe(false)
  })

  it('compares numerically, not lexically', () => {
    expect(isNewerVersion('v1.10.0', '1.9.9')).toBe(true)
    expect(isNewerVersion('v1.2.10', '1.2.9')).toBe(true)
  })

  it('pads missing parts with zero and tolerates junk segments', () => {
    expect(isNewerVersion('v1.2', '1.1.9')).toBe(true)
    expect(isNewerVersion('v1.2', '1.2.1')).toBe(false)
    expect(isNewerVersion('v2', '1.9.9')).toBe(true)
    expect(isNewerVersion('garbage', '0.0.1')).toBe(false)
  })
})
