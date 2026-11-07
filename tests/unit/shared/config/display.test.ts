import { describe, expect, it } from 'vitest'

import { makeTranslator } from '#/_helpers/i18n'
import { NAV_GROUP_LABEL_KEYS, SECTION_DISPLAY } from '@/shared/config/display'
import { SETTINGS_SECTIONS } from '@/shared/config/sections'

const tZhCN = makeTranslator('zh-CN')
const tEnUS = makeTranslator('en-US')

describe('shared/config/display — SECTION_DISPLAY', () => {
  it('exposes one entry per settings section', () => {
    for (const section of SETTINGS_SECTIONS) {
      expect(SECTION_DISPLAY[section]).toBeDefined()
    }
  })

  it('every entry carries label/description message ids that resolve in every locale', () => {
    for (const meta of Object.values(SECTION_DISPLAY)) {
      for (const t of [tZhCN, tEnUS]) {
        expect(t(meta.labelId).length).toBeGreaterThan(0)
        expect(t(meta.descriptionId).length).toBeGreaterThan(0)
      }
    }
  })

  it('every entry references a known nav group', () => {
    const groups = Object.keys(NAV_GROUP_LABEL_KEYS)
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

describe('shared/config/display — NAV_GROUP_LABEL_KEYS', () => {
  it('covers all four groups and resolves through the catalogs', () => {
    expect(tZhCN(NAV_GROUP_LABEL_KEYS.site)).toBe('站点')
    expect(tZhCN(NAV_GROUP_LABEL_KEYS.content)).toBe('内容与展示')
    expect(tZhCN(NAV_GROUP_LABEL_KEYS.service)).toBe('服务集成')
    expect(tZhCN(NAV_GROUP_LABEL_KEYS.system)).toBe('系统运维')
    expect(tEnUS(NAV_GROUP_LABEL_KEYS.site)).toBe('Site')
    expect(tEnUS(NAV_GROUP_LABEL_KEYS.system)).toBe('System operations')
  })

  it('resolves section labels per locale', () => {
    expect(tZhCN(SECTION_DISPLAY.general.labelId)).toBe('基本信息')
    expect(tEnUS(SECTION_DISPLAY.general.labelId)).toBe('Basic info')
    expect(tZhCN(SECTION_DISPLAY.cache.descriptionId)).toBe('OG 图 / 头像 / 日历的服务端缓存')
  })
})
