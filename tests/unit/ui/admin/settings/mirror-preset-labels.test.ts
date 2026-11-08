import { describe, expect, it } from 'vitest'

import type { AppLocale } from '@/shared/i18n/locales'
import type { UiMessageId } from '@/shared/i18n/messages/ui/en-US'

import { createServerTranslator } from '@/server/infra/i18n'
import { SUPPORTED_LOCALES } from '@/shared/i18n/locales'
import { uiMessagesEnUS } from '@/shared/i18n/messages/ui/en-US'
import { GRAVATAR_MIRROR_PRESETS } from '@/ui/admin/settings/gravatar-mirror-presets'

// The admin mirror dropdown's options are catalog ids, not display prose:
// `CommentsForm` renders `t(option.labelKey)`, so every locale (and any future
// locale) gets a translated label and no raw Chinese literal ships in code.

const PREFIX = 'admin.settings.comments.avatar.mirrorPreset.'

const EXPECTED: Record<string, Record<AppLocale, string>> = {
  'admin.settings.comments.avatar.mirrorPreset.gravatarOfficial': {
    'en-US': 'Gravatar official (www.gravatar.com)',
    'zh-CN': 'Gravatar 官方（www.gravatar.com）',
    'zh-TW': 'Gravatar 官方（www.gravatar.com）',
    'zh-HK': 'Gravatar 官方（www.gravatar.com）',
  },
  'admin.settings.comments.avatar.mirrorPreset.gravatarCn': {
    'en-US': 'Gravatar China (cn.gravatar.com)',
    'zh-CN': 'Gravatar 中国（cn.gravatar.com）',
    'zh-TW': 'Gravatar 中國（cn.gravatar.com）',
    'zh-HK': 'Gravatar 中國（cn.gravatar.com）',
  },
  'admin.settings.comments.avatar.mirrorPreset.gravatarSecure': {
    'en-US': 'Gravatar Secure (secure.gravatar.com)',
    'zh-CN': 'Gravatar Secure（secure.gravatar.com）',
    'zh-TW': 'Gravatar Secure（secure.gravatar.com）',
    'zh-HK': 'Gravatar Secure（secure.gravatar.com）',
  },
  'admin.settings.comments.avatar.mirrorPreset.loliNet': {
    'en-US': 'loli.net (gravatar.loli.net)',
    'zh-CN': 'loli.net（gravatar.loli.net）',
    'zh-TW': 'loli.net（gravatar.loli.net）',
    'zh-HK': 'loli.net（gravatar.loli.net）',
  },
  'admin.settings.comments.avatar.mirrorPreset.geekzu': {
    'en-US': 'Geekzu (sdn.geekzu.org)',
    'zh-CN': '极客族（sdn.geekzu.org）',
    'zh-TW': '極客族（sdn.geekzu.org）',
    'zh-HK': '極客族（sdn.geekzu.org）',
  },
  'admin.settings.comments.avatar.mirrorPreset.v2ex': {
    'en-US': 'V2EX (cdn.v2ex.com)',
    'zh-CN': 'V2EX（cdn.v2ex.com）',
    'zh-TW': 'V2EX（cdn.v2ex.com）',
    'zh-HK': 'V2EX（cdn.v2ex.com）',
  },
  'admin.settings.comments.avatar.mirrorPreset.cravatarCn': {
    'en-US': 'Cravatar China (cravatar.cn)',
    'zh-CN': 'Cravatar 中国（cravatar.cn）',
    'zh-TW': 'Cravatar 中國（cravatar.cn）',
    'zh-HK': 'Cravatar 中國（cravatar.cn）',
  },
  'admin.settings.comments.avatar.mirrorPreset.cravatar': {
    'en-US': 'Cravatar (cravatar.com)',
    'zh-CN': 'Cravatar（cravatar.com）',
    'zh-TW': 'Cravatar（cravatar.com）',
    'zh-HK': 'Cravatar（cravatar.com）',
  },
  'admin.settings.comments.avatar.mirrorPreset.libravatarProxy': {
    'en-US': 'Libravatar proxy (seccdn.libravatar.org)',
    'zh-CN': 'Libravatar 代理（seccdn.libravatar.org）',
    'zh-TW': 'Libravatar 代理（seccdn.libravatar.org）',
    'zh-HK': 'Libravatar 代理（seccdn.libravatar.org）',
  },
  'admin.settings.comments.avatar.mirrorPreset.weavatar': {
    'en-US': 'WeAvatar (weavatar.com)',
    'zh-CN': 'WeAvatar（weavatar.com）',
    'zh-TW': 'WeAvatar（weavatar.com）',
    'zh-HK': 'WeAvatar（weavatar.com）',
  },
  'admin.settings.comments.avatar.mirrorPreset.webpSe': {
    'en-US': 'webp.se (gravatar.webp.se)',
    'zh-CN': 'webp.se（gravatar.webp.se）',
    'zh-TW': 'webp.se（gravatar.webp.se）',
    'zh-HK': 'webp.se（gravatar.webp.se）',
  },
  'admin.settings.comments.avatar.mirrorPreset.zeruns': {
    'en-US': 'Zeruns (gravatar.zeruns.com)',
    'zh-CN': 'Zeruns（gravatar.zeruns.com）',
    'zh-TW': 'Zeruns（gravatar.zeruns.com）',
    'zh-HK': 'Zeruns（gravatar.zeruns.com）',
  },
  'admin.settings.comments.avatar.mirrorPreset.zerunsTech': {
    'en-US': 'Zeruns Tech (gravatar.zeruns.tech)',
    'zh-CN': 'Zeruns Tech（gravatar.zeruns.tech）',
    'zh-TW': 'Zeruns Tech（gravatar.zeruns.tech）',
    'zh-HK': 'Zeruns Tech（gravatar.zeruns.tech）',
  },
  'admin.settings.comments.avatar.mirrorPreset.sepCc': {
    'en-US': 'sep.cc (cdn.sep.cc)',
    'zh-CN': 'sep.cc（cdn.sep.cc）',
    'zh-TW': 'sep.cc（cdn.sep.cc）',
    'zh-HK': 'sep.cc（cdn.sep.cc）',
  },
  'admin.settings.comments.avatar.mirrorPreset.w3tt': {
    'en-US': 'w3tt (gravatar.w3tt.com)',
    'zh-CN': 'w3tt（gravatar.w3tt.com）',
    'zh-TW': 'w3tt（gravatar.w3tt.com）',
    'zh-HK': 'w3tt（gravatar.w3tt.com）',
  },
  'admin.settings.comments.avatar.mirrorPreset.sevenCdn': {
    'en-US': 'SevenCDN (use.sevencdn.com)',
    'zh-CN': 'SevenCDN（use.sevencdn.com）',
    'zh-TW': 'SevenCDN（use.sevencdn.com）',
    'zh-HK': 'SevenCDN（use.sevencdn.com）',
  },
}

describe('Gravatar mirror presets — catalog labels', () => {
  it('every preset states a typed catalog id instead of a display literal', () => {
    for (const preset of GRAVATAR_MIRROR_PRESETS) {
      expect(preset).not.toHaveProperty('label')
      expect(preset.labelKey.startsWith(PREFIX)).toBe(true)
      expect(Object.hasOwn(uiMessagesEnUS, preset.labelKey)).toBe(true)
      expect(EXPECTED[preset.labelKey]).toBeDefined()
    }
    // The preset set and the hand-written table stay in lockstep.
    expect(GRAVATAR_MIRROR_PRESETS).toHaveLength(Object.keys(EXPECTED).length)
  })

  it.each(GRAVATAR_MIRROR_PRESETS.map((preset) => preset.labelKey as UiMessageId))(
    '%s resolves in every locale without leaking the key',
    (labelKey) => {
      for (const locale of SUPPORTED_LOCALES) {
        const label = createServerTranslator(locale).format(labelKey)
        expect(label).toBe(EXPECTED[labelKey]![locale])
        expect(label).not.toContain('mirrorPreset.')
      }
    },
  )

  it('keeps mirror URLs unchanged', () => {
    expect(GRAVATAR_MIRROR_PRESETS.map((preset) => preset.value)).toEqual([
      'https://www.gravatar.com/avatar',
      'https://cn.gravatar.com/avatar',
      'https://secure.gravatar.com/avatar',
      'https://gravatar.loli.net/avatar',
      'https://sdn.geekzu.org/avatar',
      'https://cdn.v2ex.com/gravatar',
      'https://cravatar.cn/avatar',
      'https://cravatar.com/avatar',
      'https://seccdn.libravatar.org/gravatarproxy',
      'https://weavatar.com/avatar',
      'https://gravatar.webp.se/avatar',
      'https://gravatar.zeruns.com/avatar',
      'https://gravatar.zeruns.tech/avatar',
      'https://cdn.sep.cc/avatar',
      'https://gravatar.w3tt.com/avatar',
      'https://use.sevencdn.com/avatar',
    ])
  })
})
