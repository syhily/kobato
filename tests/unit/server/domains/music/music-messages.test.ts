import { describe, expect, it } from 'vitest'

import type { ErrorMessageParams } from '@/shared/contracts/api-error'
import type { AppLocale } from '@/shared/i18n/locales'
import type { UiMessageId } from '@/shared/i18n/messages/ui/en-US'

import { descriptorFor } from '@/server/infra/http/error-descriptor'
import { createServerTranslator } from '@/server/infra/i18n'
import { SUPPORTED_LOCALES } from '@/shared/i18n/locales'

// Music add/write errors across all four locales. The asset noun
// (`audio`/`cover`) is a machine kind rendered by ICU `select`.
interface Case {
  key: UiMessageId
  params?: ErrorMessageParams
  messages: Record<AppLocale, string>
}

const PARAM_CASES: Case[] = [
  {
    key: 'music.error.assetBadProtocol',
    params: { asset: 'audio' },
    messages: {
      'en-US': 'Audio URL protocol is not supported',
      'zh-CN': '音频地址协议不被支持',
      'zh-TW': '音訊位址通訊協定不受支援',
      'zh-HK': '音訊位址通訊協定不受支援',
    },
  },
  {
    key: 'music.error.assetBlockedHost',
    params: { asset: 'cover' },
    messages: {
      'en-US': 'Cover URL points at a private or local address',
      'zh-CN': '封面地址指向了内网或本机',
      'zh-TW': '封面位址指向內網或本機',
      'zh-HK': '封面位址指向內網或本機',
    },
  },
  {
    key: 'music.error.downloadFailed',
    params: { asset: 'audio' },
    messages: {
      'en-US': 'Downloading the audio failed. Please try again later.',
      'zh-CN': '下载音频失败，请稍后再试',
      'zh-TW': '下載音訊失敗，請稍後再試',
      'zh-HK': '下載音訊失敗，請稍後再試',
    },
  },
  {
    key: 'music.error.downloadFailedStatus',
    params: { asset: 'cover', status: 503 },
    messages: {
      'en-US': 'Downloading the cover failed: 503',
      'zh-CN': '下载封面失败：503',
      'zh-TW': '下載封面失敗：503',
      'zh-HK': '下載封面失敗：503',
    },
  },
  {
    key: 'music.error.upstreamTrackNotFound',
    params: { sourceId: 'abc123' },
    messages: {
      'en-US': 'The upstream service did not find a track with sourceId=abc123',
      'zh-CN': '上游未找到 sourceId=abc123 的歌曲',
      'zh-TW': '上游未找到 sourceId=abc123 的歌曲',
      'zh-HK': '上游未找到 sourceId=abc123 的歌曲',
    },
  },
]

const PLAIN_KEYS: UiMessageId[] = [
  'music.error.notFound',
  'music.error.notFoundOrDeleted',
  'music.error.notFoundOrOffline',
  'music.error.metadataWriteFailed',
  'music.error.playerIdConflict',
  'music.error.upstreamUnavailable',
  'music.error.upstreamNoAudio',
  'music.error.upstreamIncomplete',
  'music.error.upstreamNoVkey',
]

describe('music messages — four locales', () => {
  it.each(PARAM_CASES)('$key resolves in every locale', ({ key, params, messages }) => {
    for (const locale of SUPPORTED_LOCALES) {
      expect(createServerTranslator(locale).format(key, params)).toBe(messages[locale])
    }
  })

  it.each(PARAM_CASES)('$key keeps an English fallback with no Han characters', ({ key, params }) => {
    expect(descriptorFor(key, params).fallbackMessage).not.toMatch(/[\u3400-\u4DBF\u4E00-\u9FFF]/)
  })

  it.each(PLAIN_KEYS)('%s resolves in every locale without leftover placeholders', (key) => {
    for (const locale of SUPPORTED_LOCALES) {
      const message = createServerTranslator(locale).format(key)
      expect(message).not.toBe('')
      expect(message).not.toMatch(/[{}]/)
    }
  })
})
