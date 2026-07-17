import { describe, expect, it } from 'vitest'

import { NAV_GROUP_LABEL, SECTION_DISPLAY } from '@/shared/config/display'
import { SETTINGS_SECTIONS } from '@/shared/config/sections'

describe('shared/config/display — SECTION_DISPLAY', () => {
  it('exposes one entry per settings section', () => {
    for (const section of SETTINGS_SECTIONS) {
      expect(SECTION_DISPLAY[section]).toBeDefined()
    }
  })

  it('every entry carries a non-empty Chinese label and description', () => {
    for (const meta of Object.values(SECTION_DISPLAY)) {
      expect(meta.label.length).toBeGreaterThan(0)
      expect(meta.description.length).toBeGreaterThan(0)
    }
  })

  it('every entry references a known nav group', () => {
    const groups = Object.keys(NAV_GROUP_LABEL)
    for (const meta of Object.values(SECTION_DISPLAY)) {
      expect(groups).toContain(meta.group)
    }
  })

  it('every entry has a PascalCase icon name', () => {
    for (const meta of Object.values(SECTION_DISPLAY)) {
      expect(meta.icon).toMatch(/^[A-Z][A-Za-z0-9]+$/)
    }
  })
})

describe('shared/config/display — NAV_GROUP_LABEL', () => {
  it('covers all four groups with non-empty labels', () => {
    expect(NAV_GROUP_LABEL.site).toBe('站点')
    expect(NAV_GROUP_LABEL.content).toBe('内容与展示')
    expect(NAV_GROUP_LABEL.service).toBe('服务集成')
    expect(NAV_GROUP_LABEL.system).toBe('系统运维')
  })
})
